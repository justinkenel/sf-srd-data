const cheerio = require('cheerio');
const {
  scrapeRequest,
  buildHeaderBasedTree,
  getUntil,
  getBetween,
  getAfter,
  getRest,parseBold,
	getByItalics,splitByLine,
	parseCommaList,
  parseLevel,parseModifier,
	writeObjectsToFile,ifRunningThis
} = require('./base');
const {loadSkills}=require('./skills');
const debug = require('debug')('classes.js');

async function getClassList() {
  const c = await scrapeRequest({
    uri: 'Classes.aspx'
  });
  let $ = cheerio.load(c);
  const aList = $('#ctl00_MainContent_FullClassList a');
  debug('iterating over', aList.length);
  const classLinks = [];
  aList.each((i, a) => {
    const el = $(a);
    const name = el.text().trim();
    if (name == 'Drone') return;
    classLinks.push({
      link: el.attr('href'),
      name
    });
  });
  return classLinks;
}

async function listClassSpecifics({
  link
}) {
  const c = await scrapeRequest({
    uri: link
  });
  let $ = cheerio.load(c);
  const links = $('span#ctl00_MainContent_MainClassLabel a');
  const specifics = [];
  links.each((i, o) => {
    const el = $(o);
    const name = el.text().trim();
    if (!{
        'main details': 1,
        'archetypes': 1,
        'class builds': 1
      }[name.toLowerCase()]) specifics.push({
      name,
      link: el.attr('href')
    });
  });
  return specifics;
}

async function getRawSpecific({
  link,
  name
}, path) {
  const c = await scrapeRequest({
    uri: link
  });
  let $ = cheerio.load(c);

  debug('loading specific', name);
  const contents = $(path || '#ctl00_MainContent_DataListTalentsAll tr td span').contents();
  if (!contents.length) throw new Error('Expected data for: ' + name);
  const tree = buildHeaderBasedTree($, contents);
  // debug(tree);
  return tree;
}

function getAbilityDef(x) {
  const imgs = x.getEl().find('img');
  let modifiers = [];
  for (let i = 0; i < imgs.length; ++i) modifiers.push(imgs.eq(i).attr('title'));
  modifiers = modifiers.filter(x => x != 'SFS Legal');

  const raw_name = x.text.trim();
  // const [source] = x.children.slice(1,2);
  const raw_description = x.children.map(x => x.text.trim());
  let [name, def = ''] = (raw_name.match(/(.+)\((.+)\)/) || []).slice(1).map(x => x.trim());

  if (!name) name = (raw_name.split('-')[0]).trim();

  const [ability_type, skill] = def.split(';').map(x => x.trim());

  const [required_level] = (raw_name.match(/.+\s+([\w\d]+) Level/) || []).slice(1);

  return {
    name,
    ability_type,
    skill,

    raw_name,
    // source,
    raw_description,
    modifiers,

    required_level
  };
}

async function getExpertiseTalents(o) {
  const specific = await getRawSpecific(o);
  const abilities = specific.children.filter(x => x.header == 2)
    .map(getAbilityDef);
  return {
    name: 'expertise_talents',
    abilities
  };
}

function breakdownByLevel(specific) {
  const firstLevel = specific.children.filter(x => x.header == 2);
  const highers = specific.children.filter(x => x.header == 1);
  let list = [];

  if (firstLevel.length) list.push({
    text: '1st level',
    children: firstLevel
  });
  list = list.concat(highers);

  return list.map(x => {
    const {
      text: level_text,
      children
    } = x;
    const abilities = children.filter(x => x.children).map(getAbilityDef);

    return {
      level_text,
      abilities
    }
  });
}

async function getImprovisations(o) {
  const specific = await getRawSpecific(o);
  const improv1 = getUntil(specific, '4th level');

  const highers = specific.children.filter(x => x.header == 1);

  const list = [{
    text: '1st level',
    children: improv1
  }].concat(highers);

  const improvisations_by_level = list.map(x => {
    const {
      text: level,
      children
    } = x;
    const abilities = children.filter(x => x.children).map(getAbilityDef);

    return {
      level,
      abilities
    }
  });

  return {
    name: 'improvisations',
    improvisations_by_level
  };
}

async function getExocortex(o) {
  const specific = await getRawSpecific(o);
  const abilities = specific.children.map(getAbilityDef);
  return {
    name: 'exocortex',
    abilities
  };
}

async function getTricks(o) {
  const specific = await getRawSpecific(o);
  const tricks_by_level = breakdownByLevel(specific);
  return {
    name: 'tricks',
    tricks_by_level
  };
}

async function listAbilitySets(o) {
  const specific = await getRawSpecific(o);
  const abilitySets = specific.children.filter(x => x.header == 2)
    .map(x => {
      const name = x.text.trim();
      const link = x.getEl().find('a').eq(0).attr('href');
      return {
        name,
        link
      };
    });
  return abilitySets;
}
async function getAbilitySet({
  name,
  link
}) {
  const specific = await getRawSpecific({
    name,
    link
  });
  const abilities = specific.children[0].children
    .filter(x => x.header == 2)
    .map(getAbilityDef);
  const raw_description = specific.children[0].children
    .filter(x => !x.header)
    .map(x => x.text.trim())
  return {
    name,
    raw_description,
    abilities
  };
}
async function getAbilitySets(o) {
  const list = await listAbilitySets(o);
  const abilitySets = await Promise.all(list.map(getAbilitySet));
  return abilitySets;
}
async function getConnections(o) {
  const connections = await getAbilitySets(o);
  return {
    name: 'connections',
    connections
  };
}

async function getExploits(o) {
  const specific = await getRawSpecific(o);
  const exploits_by_level = breakdownByLevel(specific);
  return {
    name: 'exploits',
    exploits_by_level
  };
}

async function getSpecializations(o) {
  const specific = await getRawSpecific(o);
  const specializations = specific.children
    .map(s => {
      const name = s.text.trim();

      let associated_skills = getBetween(s, 'associated skills', 'specialization exploit')
        .map(x => x.text.trim());
      if (associated_skills[0].indexOf(': ') == 0) {
        associated_skills[0] = associated_skills[0].slice(2);
      }

      let specialization_exploit = getAfter(s, 'specialization exploit');

      const abilityText = getRest(s, specialization_exploit.toLowerCase());

      if (specialization_exploit.indexOf(': ') == 0) {
        specialization_exploit = specialization_exploit.slice(2)
      }

      const abilityName = abilityText[0].text.trim();
      const rest = abilityText.slice(1).map(x => x.text.trim());

      return {
        name,
        associated_skills,
        specialization_exploit,
        ability: {
          name: abilityName,
          raw_description: rest
        }
        // d: s.children.map(x=>x.text.trim())
      }
    });
  return {
    name: 'specializations',
    specializations
  };
}

async function getFightingStyles(o) {
  const fighting_styles = await getAbilitySets(o);
  return {
    name: 'fighting_styles',
    fighting_styles
  }
}

async function getGearBoosts(o) {
  const specific = await getRawSpecific(o);
  const abilities = specific.children.map(getAbilityDef);
  return {
    name: 'gear_boosts',
    abilities
  };
}

async function getMagicHacks(o) {
  const specific = await getRawSpecific(o);
  const magic_hacks_by_level = breakdownByLevel(specific);
  return {
    name: 'magic_hacks',
    magic_hacks_by_level
  };
}

async function getAspects(o) {
	console.log(o);
	const specific = await getRawSpecific(o, '#ctl00_MainContent_DetailedOutput');
	// console.log(Object.keys(specific), specific[0]);
	console.log(JSON.stringify(specific));
	if(!specific.children.length) throw new Error('Missing aspects');
	const aspects = specific.children.map(raw=>{
		const name=raw.text.trim();
		const abilities_raw = parseBold(raw, {
			'Aspect Insight (Ex)': x=>x,
			'Aspect Embodiment (Ex)': x=>x,
			'Aspect Embodiment (Su)': x=>x,
			'Aspect Catalyst (Su)': x=>x,
			'Aspect Finale (Su)': x=>x,
			'Aspect Finale (Ex)': x=>x,
			'Aspect Finale (Sp)': x=>x,
			'Source': x=>x
		});

		const [source,description] = splitByLine(abilities_raw.Source);
		const abilities = Object.keys(abilities_raw)
			.filter(key=>key!='Source')
			.map(key => {
				const raw=abilities_raw[key];
				const [ab,ability_type] = key.match(/(Aspect \w+) \((\w\w)\)/).slice(1);
				let improved=undefined;
				let description=raw;
				if(ab == 'Aspect Catalyst') {
					improved = getByItalics(raw).Improved;
					description = getUntil(raw,'improved');
				}
				return {name:ab,ability_type,description,improved};
			});

		return {name,abilities_raw,description,abilities,source};
	});
	return {
    name: 'aspects',
    aspects
  };
}

async function getDisciplines(o) {
  const specific = await getRawSpecific(o,'#ctl00_MainContent_DetailedOutput');
  const disciplines_by_level = breakdownByLevel(specific);
  return {
    name: 'disciplines',
    disciplines_by_level
  };
}

async function getTheorems(o) {
  const specific = await getRawSpecific(o,'#ctl00_MainContent_DetailedOutput');
  const theorems_by_level = breakdownByLevel(specific);
  return {
    name: 'theorems',
    theorems_by_level
  };
}

async function getParadigmShifts(o) {
  const specific = await getRawSpecific(o,'#ctl00_MainContent_DetailedOutput');
  const paradigm_shifts_by_level = breakdownByLevel(specific);
  return {
    name: 'paradign_shifts',
    paradigm_shifts_by_level
  };
}

const specificMap = {
  'expertise talents': getExpertiseTalents,
  'improvisations': getImprovisations,
  'exocortex': getExocortex,
  'tricks': getTricks,
  connections: getConnections,
  exploits: getExploits,
  specializations: getSpecializations,
  // 'stellar revelations': getStellarRevelations
  'fighting styles': getFightingStyles,
  'gear boosts': getGearBoosts,
  'magic hacks': getMagicHacks,
	'aspects': getAspects,
  'disciplines': getDisciplines,
  'theorems': getTheorems,
  'paradigm shifts': getParadigmShifts
};

async function getSpecific({
  link,
  name
}) {
  if (specificMap[name.toLowerCase()]) return specificMap[name.toLowerCase()]({
    link,
    name
  });
  else return null;
}



function processClassTree($, name, tree) {
  const [primary] = tree;
  debug(primary.text, name);
  if (primary.text.toLowerCase() != name.toLowerCase()) throw new Error("What?");
  const primaryChildren = primary.children;

  const keyAbilityScore = primaryChildren.find(x => x.text.indexOf('Key Ability Score') == 0);
  const key_ability_score = keyAbilityScore.text.match(/Key Ability Score - (\w\w\w)/)[1];
  const key_ability_score_description = keyAbilityScore.children.map(x => x.text);

  const classSkills = primaryChildren.find(x => x.text == 'Class Skills');
  const fullClassSkillList = classSkills.children.find(x => x.text.indexOf('class skills are') != -1);
  const class_skills_raw = (fullClassSkillList.text.match(/class skills are (.+)/) || [])[1]
    .slice(0, -1)
    .split('),')
    .map(x => x.slice(-1)[0] == ')' ? x : x + ')')
    .map(x => x.trim().toLowerCase());

  const class_skills = class_skills_raw.map(x => {
    const name = (x.match(/(.+)\(/) || [])[1].trim();
    if (!name) throw new Error("Failed to get skill from: " + name);
    return name;
  });

  const levelSkillPointsMatch = classSkills.children.map(x => x.text).join('')
    .toLowerCase()
    .match(/skill points at each level: (\d+ \+ \w\w\w modifier)/);
  const level_skill_points_raw = (levelSkillPointsMatch || [])[1];

  let [level_skill_points, level_skill_modifier] =
  (level_skill_points_raw.match(/(\d+) \+ (\w\w\w) modifier/) || []).slice(1);

  const proficiencies = primaryChildren.find(x => x.text == 'Proficiencies');
  const proficiencies_by_type = {};
  proficiencies.children.forEach(x => {
    const type = x.text;
    // const forType = [];
    // x.children.forEach(c => c.text.split(',').map(s => s.trim().toLowerCase()).forEach(s => forType.push(s)));
		const forType = parseCommaList(x);
    proficiencies_by_type[type] = forType;
  });

  const classFeatures = primaryChildren.find(x => x.text == 'Class Features');
  const classFeaturesTable = classFeatures.children[0].getEl();

  const rows = classFeaturesTable.find('tr');
  if (rows.length != 21 && rows.length != 22) throw new Error('Expected 21 or 22 rows, got: ' + rows.length);
  const features = rows.toArray().slice(-20).map(o => {
    const [
      level_raw,
      base_attack_bonus_raw,
      fort_raw,
      ref_raw,
      will_raw,
      special_raw,
      spells1, spells2, spells3, spells4, spells5, spells6
    ] = $(o).find('td').toArray().map(td => $(td).text());

    const special = parseCommaList(special_raw);//.split(',').map(x => x.trim());

    const perLevel = {
      level: parseLevel(level_raw),
      level_raw,
      base_attack_bonus_raw,
      base_attack_bonus:parseModifier(base_attack_bonus_raw),

      fort_raw,
      ref_raw,
      will_raw,
      fort: parseModifier(fort_raw),
      ref: parseModifier(ref_raw),
      will: parseModifier(will_raw),

      special_raw,
      special
    };
    if (rows.eq(0).text().trim().toLowerCase() == 'spells per day') {
      perLevel.spells_per_day = [spells1, spells2, spells3, spells4, spells5, spells6];
    }

    return perLevel;
  });

  const spellsKnown = classFeatures.children.find(x => x.text.indexOf("Spells Known") == 0);
  let spells_known;
  if (spellsKnown) {
    const spellsTableRows = spellsKnown.getEl().find('tr');
    if (spellsTableRows.length != 21) throw new Error('Expected 21 rows, got: ' + spellsTableRows.length);
    spells_known = spellsTableRows.toArray().slice(-20).map(o => {
      const levelAndKnown = $(o).find('td').toArray().map(td => $(td).text());
      if (levelAndKnown.length != 8) throw new Error('Expected 8, got: ' + levelAndKnown.length);
      const [level] = levelAndKnown;
      return {
        level,
        known: levelAndKnown.slice(1)
      };
    })
  }

  return {
    name,
    // keyAbilityScore,
    key_ability_score,
    key_ability_score_description,
    // classSkills,
    class_skills,
    class_skills_raw,
    // proficiencies,
    proficiencies_by_type,
    level_skill_points_raw,

    level_skill_points,
    level_skill_modifier,

    features,
    spells_known
    // classFeatures

    // rest: tree.slice(1)
  };
}

async function getClassAbilities({
  name,
  link
}) {
  debug('getting abilities for:', name);

  const c = await scrapeRequest({
    uri: link
  });
  let $ = cheerio.load(c);
  const content = $('#ctl00_MainContent_DataListClasses_ctl00_LabelName').contents();
  if (!content.length) throw new Error('unable to find data list classes');

  const tree = buildHeaderBasedTree($, content);
  const abilities = tree.children
    .filter(x => x.header == 1)
    .filter(x => x.text.trim().toLowerCase() != name.toLowerCase())
    .map(getAbilityDef);
  return abilities;
}

async function getClass({
  name,
  link
}) {
  const classDef = await scrapeRequest({
    uri: link
  });
  let $ = cheerio.load(classDef);

  const mainContext = $('#ctl00_MainContent_DataListClasses');
  if (!mainContext.length) throw new Error('unable to find data list classes');

  const rawText = mainContext.text();
  const hit_points = (rawText.match(/Hit Points: (\d+)/) || [])[1];
  const stamina_points = (rawText.match(/Stamina Points: (\d+)/) || [])[1];

  const contentChildren = $('#ctl00_MainContent_DataListClasses_ctl00_LabelName').contents();
  // debug(contentChildren);

  const specificsForClass = await (listClassSpecifics({
    link,
    name
  }));
  // debug(specifics);

  let specifics = await Promise.all(specificsForClass.map(getSpecific));
  if (!specifics.find(x => x)) specifics = undefined;

  const def = buildHeaderBasedTree($, contentChildren);
  const fullClass = processClassTree($, name, def.children);

  fullClass.hit_points = hit_points;
  fullClass.stamina_points = stamina_points;
  fullClass.specifics = specifics;
  fullClass.class_abilities = await getClassAbilities({
    name,
    link
  });

  return fullClass;
}

// once scraped, process
async function processClass({
  definition,
  skillsByName
}) {
  definition = JSON.parse(JSON.stringify(definition));

  const {
    class_skills
  } = definition;
  debug('checking', class_skills, 'against', Object.keys(skillsByName));
  const invalid = class_skills.filter(s => !skillsByName[s]);
  if (invalid.length) throw new Error("Invalid skills: " + invalid.join(','));

  return definition;
}

async function loadClasses() {
	const skills = await loadSkills();
	const skillsByName = {};
	skills.forEach(x=>skillsByName[x.name.toLowerCase()]=x);

  debug('making call');
  const classList = await getClassList();
  const rawClasses = await Promise.all(classList.map(getClass));
  const list = await Promise.all(rawClasses.map(definition => processClass({
    definition,
    skillsByName
  })));

  return list;
}

async function writeClasses() {
	const objects = await loadClasses();
	writeObjectsToFile({type:'classes', objects});
}
ifRunningThis(__filename, writeClasses);

module.exports = {writeClasses};
