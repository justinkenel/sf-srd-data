const cheerio=require('cheerio');
const {scrapeRequest,headerBasedTreeRequest,
  parseTableBasedRequest,splitByLine,parseCommaList,
	ifRunningThis,writeObjectsToFile,
  parseBold,getByBold}=require('./base');
const debug=require('debug')('aliens.js');

const parse = require('./parsing');

async function listAliens() {
  const c = await scrapeRequest({uri:'Aliens.aspx?Letter=All'});
  let $=cheerio.load(c);
  const rows = $('#ctl00_MainContent_GridViewAliens tr');
  if(!rows.length) throw new Error("No rows");
  debug("listing aliens:",rows.length);
  return rows.map((i,tr) => {
    const el=$(tr);
    const parts=el.find('td').toArray();
    const a = $(parts[0]).find('a');
    const raw_name = $(a).text();
    const link = $(a).attr('href');

    let nameParts = raw_name.split(',').map(x=>x.trim());
    let name,family;
    if(parts.length == 1) name=nameParts[0];
    else [family,name]=nameParts;

    // debug(name,link);

    const [cr,type,environment]=parts.slice(1).map(x=>$(x).text());

    return {
      name,link,cr,type,environment,family,raw_name
    };
  }).toArray().filter(x=>!!x.name);
}

const clean=(x) => x.map(y=>y.text).join('').split(';').filter(x=>!!x);
const value=(x,k) => {
  if(!Array.isArray(x)) x=[x];
  const c = clean(x);
  if(c.length != 1) throw new Error("Expected single value: "+JSON.stringify(c)+" for "+k);
  return c[0];
};

function getDefense(name,defense) {
  return parseBold(defense,{
    HP:value,
    RP:value,
    EAC:value,
    KAC:clean,
    Fort:value,
    Ref:value,
    Will:clean,
    Immunities:parseCommaList,
    Weaknesses:parseCommaList,
    'Defensive Abilities':parseCommaList,
    DR: parseCommaList,
    SR: parseCommaList,
    Resistances: parse.resistances,
  });
}

function parseSpellLike(arr) {
  const sets = [[]];
  arr.forEach(x => {
    sets[sets.length-1].push(x.text);
    if(x.line_break) sets.push([])
  });
  const parts = sets.filter(x=>x.length);
  if(parts[0][0].indexOf('(CL') != 0) throw new Error("Expected Caster Level, got: "+JSON.stringify(parts[0]));
  const caster_level_raw=parts[0];

  const by_frequency = [];
  parts.slice(1).forEach(x => {
    let frequency = x[0];
    let spell_level;
    if(frequency.match(/.+\(.+\)/)) {
      [spell_level,frequency]=frequency.match(/(.+)\((.+)\)/).slice(1).map(x=>x.trim());
    }
    const rest = x.slice(1).join(' ');
    by_frequency.push({
      spell_level,
      frequency,
      abilities: parseCommaList(rest)
    });
  });

  return {
    caster_level_raw,
    by_frequency
  };
}

function getOffense(name,offense) {
  // return getByBold(offense);
  return parseBold(offense, {
    Speed: parseCommaList, // parse.speeds,
    Melee: parseCommaList,
    'Offensive Abilities': parseCommaList,
    'Spell-Like Abilities': parseSpellLike,
    'Multiattack': parseCommaList,
    'Ranged': parseCommaList,
    'Technomancer Spells Known': parseSpellLike,
    "Mystic Spell-Like Abilities": parseSpellLike,
    "Mystic Spells Known":parseSpellLike,
    Connection: x=>x,
    "Cerebric Fungus Spell-Like Abilities": parseSpellLike,
    "Dessamar Spell-Like Abilities": parseSpellLike,
    "Hanakan Spell-Like Abilities": parseSpellLike,
    "Special Attacks": parseCommaList,
    "Spells Known": parseSpellLike,
    "Ifrit Spell-Like Abilities": parseSpellLike,
    "Oread Spell-Like Abilities": parseSpellLike,
    "Sylph Spell-Like Abilities": parseSpellLike,
    "Undine Spell-Like Abilities": parseSpellLike,
    "Shakalta Spell-Like Abilities": parseSpellLike
  });
}

function getStats(name,stats) {
  if(!stats) {
    debug('no stats:',name);
    return null;
  }
  return parseBold(stats,{
    STR:value,
    DEX:value,
    CON:value,
    INT:value,
    WIS:value,
    CHA:value,
    Skills:parseCommaList,
    Languages:parseCommaList,
    "Other Abilities":parseCommaList,
    Gear: x => parseCommaList(x.map(y=>y.text).join(' ')),
    Feats: parseCommaList,
    Augmentations: parseCommaList
  });
}

const abilityTypeSelection={
  aura: (text,stats_block,base_stats) => {
    if(text.indexOf(" aura") != -1) return true; // text = text.slice(0,text.indexOf(" aura"));
    if(text.indexOf("aura of ") == 0) return true; // text = text.slice("aura of ".length);
    return (base_stats.aura||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  defensive: (text,stats_block) => {
    return (stats_block.defense['Defensive Abilities']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  other: (text, stats_block) => {
    return (stats_block.stats['Other Abilities']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  melee: (text, stats_block) => {
    return (stats_block.offense.Melee||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  ranged: (text, stats_block) => {
    return (stats_block.offense.Ranged||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  sense: (text,stats_block,base_stats) => {
    // if(text.indexOf(" aura") != -1) text = text.slice(0,text.indexOf(" aura"));
    return (base_stats.senses||[]).find(x=>x.toLowerCase().indexOf(text)  != -1);
  },
  offensive: (text,stats_block) => {
    return (stats_block.offense['Offensive Abilities']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  immunity: (text,stats_block) => {
    if(text.indexOf(' immunities') != -1) return true;
    if(text.indexOf(' immunity') != -1) return true;
    return (stats_block.defense['Immunities']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  weakness: (text,stats_block) => {
    return (stats_block.defense['Weaknesses']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  speed: (text,stats_block) => {
    return (stats_block.offense['Speed']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  languages: (text,stats_block) => {
    return (stats_block.stats['Languages']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  multiattack: (text,stats_block) => {
    return (stats_block.offense['Multiattack']||[]).find(x=>x.toLowerCase().indexOf(text) != -1);
  },
  resistance: (text,stats_block) => {
    return (stats_block.defense['Resistances']||[]).find(x=>x.type.toLowerCase().indexOf(text) != -1);
  },
};

function getStatsBlock(stat_block,base_stats) {
  const{text,children}=stat_block;
  const defense = children.find(x=>x.text == 'Defense');
  const offense = children.find(x=>x.text == 'Offense');
  const stats = children.find(x=>x.text == 'Statistics');
  const ecology = children.find(x=>x.text == 'Ecology');
  const special_raw = children.find(x=>x.text == 'Special Abilities');

  const full = {
    defense: getDefense(text,defense),
    // defense_bold: getByBold(defense),
    offense: getOffense(text,offense),
    stats:getStats(text,stats),
    ecology,
    special_raw
  };

  let special_abilities=[];
  if(special_raw) {
    const byName = getByBold(special_raw);
    special_abilities = Object.keys(byName).map(rawName => {
      const [name,ability_use_type]=rawName.match(/(.+)\((\w\w)\)/).slice(1).map(x=>x.trim());
      const def = byName[rawName];

      let format;
      const types = Object.keys(abilityTypeSelection).filter(type=>{
        const f = abilityTypeSelection[type](name.toLowerCase(), full, base_stats);
        format = f || format;
        return !!f;
      });
      if(!types.length) types.push('unknown');

      return {
        name, ability_use_type,
        def,
        description: def.map(x=>x.text),
        types,
        format,
        name_raw:rawName
      };
    });
  }

  full.special_abilities=special_abilities;

  // const missing = Object.keys(full).filter(x=>!full[x]);
  // if(missing.length) debug(text,'missing',missing.join(', '));
  return full;
}

async function loadAlien({raw_name,name,family,link:uri}) {
  const tree = await headerBasedTreeRequest({uri}, '#ctl00_MainContent_DataListTalentsAll tr td span');
  let [prime]=tree.children.filter(x=>x.text == raw_name).slice(-1);
  if(!prime) throw new Error("Failed to get main node "+raw_name);
  let description_raw = prime.children.find(x=>x.text == 'Description');
  const related_aliens = prime.children.find(x=>x.text.match(/aliens in the/i));

  const stat_block = prime.children.find(x=>x.text.indexOf(name) == 0) ||
    prime.children.find(x=>x.text.indexOf(', '+name) != -1);

  if(!description_raw && family) {
    const family_description = tree.children.find(x=>x.text == family);
    if(!family_description) debug("no family description either");
    description_raw = family_description;
  }

  // debug(prime.children.filter(x=>x.header).map(x=>x.text).join(','));

  const xpIndex = stat_block.children.findIndex(x => x.text.indexOf('XP') == 0);
  if(xpIndex == -1) throw new Error("No XP for "+name);

  const firstBoldIndex = stat_block.children.slice(xpIndex+1).findIndex(x => x.is_bold)+1;
  if(firstBoldIndex == -1) throw new Error("No bold for "+name);

  const defenseIndex = stat_block.children.findIndex(x=>x.text == 'Defense');
  if(defenseIndex == -1) throw new Error("No defense for "+name);

  const descriptor_raw = stat_block.children.slice(xpIndex+1,firstBoldIndex).map(x=>x.text.trim()).join(' ');
  const [alignment,size,type,subtype] = descriptor_raw.split(/\s+/);

  const {
    Init:initiative,
    Perception:perception,
    Senses:senses,
    Aura:aura
  } = parseBold({children:stat_block.children.slice(firstBoldIndex,defenseIndex)}, {
    Init: value,
    Senses: parseCommaList,
    Perception: clean,
    Aura: parseCommaList
  });
  // console.log(name, JSON.stringify(baseStats,null,2));

  // if(!description && !family) debug("No description "+name);
  if(!stat_block) throw new Error("No stat block"+name);

  const base_stats={
    initiative,
    perception,
    senses,
    aura
  };

  return {
    descriptor_raw: descriptor_raw,
    alignment,
    size,
    type,
    subtype,

    base_stats,

    name,
    description_raw: description_raw || tree,
    family,
    related_aliens,
    stat_block: getStatsBlock(stat_block, base_stats)
  };
}

let aliens;
async function loadAliens() {
	if(aliens) return aliens;
  const list = await listAliens();
	// eslint-disable-next-line require-atomic-updates
  aliens = await Promise.all(list.slice(0).map(loadAlien));
	return aliens;
}

async function loadSizes() {
  const sizes = await parseTableBasedRequest('Rules.aspx?Name=Size and Space&Category=Movement and Position',
    '#ctl00_MainContent_RulesResult table tr');
  debug('sizes',sizes);
  return sizes.map(raw => ({
    name: value(raw['size category']),
    height: value(raw['height or length1']),
    weight: value(raw['weight2']),
    space: value(raw['space']),
    reach_tall: value(raw['natural reach (tall3)']),
    reach_long: value(raw['natural reach (long3)'])
  }));
}

async function loadUniversalMonsterRules() {
  const properties = await headerBasedTreeRequest('UniversalMonsterRules.aspx?ItemName=All',
    '#ctl00_MainContent_DataListRulesAll tr span');
  const result = properties.children.map(p => {
    const lines = splitByLine(p);
    const source = lines[0];
    let formatIndex = lines.slice(1).findIndex(x=>x[0].text.split(/\s+/).length == 1);
    if( formatIndex == -1) {
      console.log('No Format Found '+p.text);
      formatIndex = lines.length;
    }
    const descriptionLines = lines.slice(1,formatIndex+1);
    const rest = lines.slice(formatIndex+1);
    if(!descriptionLines.length) throw new Error("Failed to find description for "+p.text);

    let description_raw=[];
    descriptionLines.forEach(x => description_raw = description_raw.concat(x));

    // const otherFields = rest.map(x=>x[0].text);
    // console.log('otherFields:',otherFields.join(','));

    const format_raw = rest.find(x => x[0].text == 'Format');
    const guidelines = rest.find(x => x[0].text == 'Guidelines');
    const offensive_abilities = rest.find(x => x[0].text == 'Offensive Abilities');

    // let formatInfo=[];
    let format = {};
    if(format_raw) {
      format=getByBold({children:format_raw});
      // Object.keys(formatData).forEach(type => {
      //   formatInfo.push({
      //     type,
      //     text: formatData[type]
      //   })
      // })
    }

    // console.log(format);

    return {
      name: p.text,
      source,
      description: description_raw.map(x=>x.text.trim()),
      description_raw,
      rest,
      format_raw,//formatInfo,
      guidelines,
      offensive_abilities,
      format
    };
  });

  return result;
}

async function writeAliens() {
	const objects = await loadAliens();
	writeObjectsToFile({type:'aliens', objects});
}

async function writeUniversalMonsterRules() {
	const objects = await loadUniversalMonsterRules();
	writeObjectsToFile({type: 'universal_monster_rules',objects});
}

module.exports={
  loadAliens,
  loadSizes,
  loadUniversalMonsterRules
};

ifRunningThis(__filename, writeAliens);
ifRunningThis(__filename, writeUniversalMonsterRules);
