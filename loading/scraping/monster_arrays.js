const cheerio=require('cheerio');
const {scrapeRequest,headerBasedTreeRequest,
  getUntil,getPostText,getBetween,parseBold,getByBold}=require('./base');
const debug=require('debug')('monster_arrays.js');

async function getTableStats(uri,headerRow) {
  if(headerRow == undefined) headerRow=0;

  const c = await scrapeRequest(uri);
  // debug(c);
  let $=cheerio.load(c);
  const rows = $('#ctl00_MainContent_RulesResult table tr');
  if(!rows.length) throw new Error('No rows');
  const headers = rows.eq(headerRow).find('td')
    .map((i,th) => $(th).text().trim().toLowerCase()).toArray();
  if(!headers.length) throw new Error('No headers');
  debug('headers:',headers);
  const stats = rows.slice(headerRow+1).map((i,row) => {
    const values = $(row).find('td')
      .map((i,th) => $(th).text().trim().toLowerCase()).toArray();
    const stat = {};
    headers.forEach((h,i) => stat[h]=values[i]);
    return stat;
  }).toArray();
  return stats;
}

async function loadArray({type,main,attack}) {
  const main_stats = await getTableStats(main);
  const attack_stats = await getTableStats(attack,1);

  const stats = main_stats.map((m) => {
    const cr = m.cr;
    const a = attack_stats.find(x=>x.cr == cr);
    if(!a) throw new Error("Failed to find cr: "+cr);
    return {
      cr,
      main: m,
      attack: a
    };
  });
  return {
    type,
    by_cr: stats
  };
}

async function loadMonsterArrays() {
  return Promise.all([{
    type: 'combatant',
    main: 'Rules.aspx?Name=Table 1: Combatant Array - Main Statistics&Category=Creating Monsters',
    attack: 'Rules.aspx?Name=Table 2: Combatant Array - Attack Statistics&Category=Creating Monsters'
  },{
    type: 'expert',
    main: 'Rules.aspx?Name=Table 3: Expert Array - Main Statistics&Category=Creating Monsters',
    attack: 'Rules.aspx?Name=Table 4: Expert Array - Attack Statistics&Category=Creating Monsters'
  },{
    type: 'spellcaster',
    main: 'Rules.aspx?Name=Table 5: Spellcaster Array - Main Statistics&Category=Creating Monsters',
    attack: 'Rules.aspx?Name=Table 6: Spellcaster Array - Attack Statistics&Category=Creating Monsters'
  }].map(loadArray));
}

module.exports = {
  loadMonsterArrays
}
