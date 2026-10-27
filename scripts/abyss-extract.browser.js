// Abyss Gear extractor for crimsondesert.gaming.tools.
//
// How to use: open https://crimsondesert.gaming.tools/crafting/abyssgear in a browser, open the
// developer console, paste this whole file and press Enter. It fetches every family's recipe
// page (paced, ~1 minute), copies the result to the clipboard and logs it. Save the clipboard
// as scripts/abyss-raw.json and run `node scripts/gen-abyss.mjs "gaming.tools YYYY-MM-DD"`.
//
// To add or remove families, edit the id lists below (they come from the category pages:
// Enhanced, Special, Tactical, Skill, Abyss Parts).
(async () => {
  const STAT = ['adr', 'climbspeedrate', 'mpregen', 'ddd', 'fireresistance', 'dpv', 'guardpvrate', 'iceresistance', 'movespeedrate', 'criticalrate', 'electricityresistance', 'swimspeedrate', 'attackspeedrate', 'staminaregen', 'hpregen'].map((s) => `recipe_item_stat_abyssgear_${s}_lv1`);
  const SKILL = ['phantomstab_lv1', 'primus', 'priscus', 'praevus', 'arrowrain_lv1', 'atordrone_lv1', 'ogre', 'cresecentaura_1_lv1', 'crowstorm_lv1', 'crowattack_lv1', 'antumbra_twohandrod', 'taranduswarrior_warhammer', 'bastier', 'frostbreath_lv1', 'frostspike_lv1', 'cresecentaura_3_lv1', 'darkchase_lv1', 'landmash_lv1', 'cresecentaura_2_lv1', 'dogclaw_lv1', 'impboss', 'forgotten_general', 'enlightenmentwave_lv1', 'energyburst_lv1', 'titan', 'lightningbreath_lv1', 'merrick', 'lanford', 'absolutedefense_lv1', 'karanda', 'soulstrike_lv1', 'flashcombo_lv1', 'swordaura_lv1', 'firebreath_lv1', 'darkenrobe_lv1', 'antumbra_spear', 'smashstorm_lv1', 'lightningstab_lv1', 'frostdeath_lv1', 'leebur', 'queenspider', 'skevald', 'catfish_bodyslam_lv1', 'muscan', 'machine_additionaldamage_lv1', 'commonhexe_additionaldamage_lv1', 'commonhumanoid_additionaldamage_lv1', 'commongolem_additionaldamage_lv1', 'boss_additionaldamage_lv1', 'commonanimal_additionaldamage_lv1', 'creature_additionaldamage_lv1', 'abyssgrass_immune', 'hyena_poisonimmune', 'immune_bismuth', 'dam_up_rotationbash', 'addmoneydroprate_lv1', 'equipdroprate_lv1', 'blockammoconsume_lv1', 'foodskilllevelup_lv1', 'reducecraftmaterial_lv1', 'additionalthief_lv1', 'collectdrop_ore_lv1', 'collectdrop_plant_lv1', 'collectdrop_animal_lv1', 'contributionexp_lv1', 'skillpointexp_lv1', 'collectdrop_log_lv1', 'addfrendly_lv1', 'equip_addhorseexp_lv1', 'equip_addpetfriendly_lv1', 'addkillskilllevel_lv1', 'attack_hprecover_lv1', 'attack_mprecover_lv1', 'attack_sprecover_lv1', 'combo_lv1', 'addcriticalratebymaterialkey_platearmor_lv1', 'addcriticalratebymaterialkey_leatherarmor_lv1', 'addcriticalratebymaterialkey_fabricarmor_lv1'].map((s) => `recipe_item_skill_abyssgear_${s}`);
  const IDS = [...STAT, ...SKILL, 'recipe_deactived_abyss_artifact'];

  const sid = (h) => (h ? h.replace(/^.*\/items\//, '').replace(/^.*\/crafting-stations\//, '') : null);
  const out = [];
  for (const id of IDS) {
    const res = await fetch(`/crafting/${id}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const name = doc.querySelector('h1')?.textContent.trim() ?? null;
    const taughtRow = [...doc.querySelectorAll('#section-info tr')].find((tr) => tr.firstElementChild?.textContent.trim() === 'Taught By');
    const taughtA = taughtRow?.querySelector('a');
    const descEl = [...doc.querySelectorAll('main *')].filter((e) => e.textContent.includes('[How to Use]')).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const lines = descEl
      ? descEl.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').split('\n').map((s) => s.trim()).filter(Boolean)
      : [];
    const fits = lines.find((l) => l.startsWith('Equippable on:'))?.replace('Equippable on:', '').trim() ?? null;
    const effect = lines.find((l) => /^An Abyss gear/.test(l)) ?? null;
    const hint = lines.filter((l) => l.startsWith('※')).join(' ') || null;
    const r = [...doc.querySelectorAll('#section-recipes table')].map((t) => {
      const rec = { n: t.querySelector('caption')?.textContent.trim(), o: [], i: [] };
      let inIng = false;
      for (const tr of t.querySelectorAll('tr')) {
        const tds = tr.querySelectorAll('td');
        const label = tds[0]?.textContent.trim();
        if (tds.length === 2 && label === 'Station') {
          const st = tds[1].textContent.trim();
          if (st !== 'Witchcraft') rec.s = st;
        } else if (tds.length === 2 && label === 'Result') {
          const a = tds[1].querySelector('a');
          const ch = tds[1].textContent.match(/\((\d+)%\)/);
          rec.o.push([a?.textContent.trim() ?? tds[1].textContent.trim(), sid(a?.getAttribute('href')), ch ? +ch[1] : null]);
        } else if (tds.length === 1 && label === 'Ingredients') {
          inIng = true;
        } else if (tds.length === 1 && inIng) {
          const det = tds[0].querySelector('details');
          if (det) {
            // A reagent category: <summary>name xN</summary> followed by every member item.
            const spans = det.querySelectorAll('summary span');
            const qty = spans[1]?.textContent.match(/x(\d+)/);
            rec.i.push({ g: spans[0]?.textContent.trim(), q: qty ? +qty[1] : 1, m: [...det.querySelectorAll('a')].map((a) => [a.textContent.trim(), sid(a.getAttribute('href'))]) });
          } else {
            const a = tds[0].querySelector('a');
            const qty = tds[0].textContent.match(/x(\d+)\s*$/);
            rec.i.push([a?.textContent.trim() ?? tds[0].textContent.trim(), sid(a?.getAttribute('href')), qty ? +qty[1] : 1]);
          }
        }
      }
      return rec;
    });
    out.push({ id, name, status: res.status, bp: taughtA?.textContent.trim() ?? null, fits, effect, hint, r });
    console.log(`${out.length}/${IDS.length} ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const json = JSON.stringify(out);
  if (typeof copy === 'function') copy(json);
  console.log(json);
  console.log(`Done: ${out.length} families (copied to clipboard).`);
})();
