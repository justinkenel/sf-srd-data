const base = require('../base')({
	uri:'https://aonprd.com/'
}), {
	parseTableBasedRequest,
	headerBasedTreeRequest,
	parseBold,parseCommaList,getByBold,
	ifRunningThis,writeObjectsToFile,
	clean:cleanString
} = base;
const debug=require('debug')('pf.monsters');
const es=require('event-stream');
const through2=require('through2');

async function listMonsters() {
	const list = await parseTableBasedRequest(
		'/Monsters.aspx?Letter=All',
		'#ctl00_MainContent_GridView6 tr'
	);
	return list.map(row => {
		const{name:{text,link}}=row;
		return {name:text,link};
	});
}

const clean=(x) => x.map(y=>y.text).join('').split(';').filter(x=>!!x);
const value=(x,k) => {
  if(!Array.isArray(x)) x=[x];
  const c = clean(x);
	if(!c.length) return '';
  if(c.length != 1) throw new Error("Expected single value: "+JSON.stringify(c)+" for "+k);
  return c[0];
};

function getMonsterDefense(entry) {
	return parseBold(entry, {
		AC: parseCommaList,
		hp: parseCommaList,
		Fort: parseCommaList,
		Ref: parseCommaList,
		Will: parseCommaList,
		Immune: parseCommaList,
		Resist: parseCommaList,
		SR: parseCommaList,
		DR: parseCommaList,
		Weaknesses: parseCommaList,
		'Defensive Abilities': parseCommaList,
	});
}

function getMonsterOffense(entry) {
	return parseBold(entry, {
		Speed: parseCommaList,
		Melee: parseCommaList,
		Space: parseCommaList,
		Reach: value,
		'Spell-Like Abilities': parseCommaList,
		'Spells Prepared': parseCommaList,
		Domains: parseCommaList,
		Ranged: parseCommaList,
		"Special Attacks": parseCommaList,
		D: parseCommaList,
		'Cleric Spells Prepared': parseCommaList,
		'Druid Spells Prepared':parseCommaList,
		'Sorcerer Spells Known': parseCommaList,
		'Ranger Spells Prepared': parseCommaList,
		'Psychic Magic': parseCommaList,
		'Psychic Spells Known': parseCommaList,
		'Bard Spells Known': parseCommaList,
		'Spells Known': parseCommaList,
		'Antipaladin Spells Prepared': parseCommaList,
		'Domain Spell-Like Abilities': parseCommaList,
		'Bloodline': value,
		Domain: value,
		'Racial Modifiers': parseCommaList,
		'Oracle Spells Known':parseCommaList,
		Mystery: parseCommaList,
		'Psychic Discipline': parseCommaList,
		'Shaman Spells Prepared':parseCommaList,
		S:parseCommaList,
		M:parseCommaList,
		Spirit:parseCommaList,
		'Wizard Spells Prepared': parseCommaList,
		'Witch Spells Prepared':parseCommaList,
		Patron: parseCommaList,
		'Arcanist Spells Prepared': parseCommaList,
		'Alchemist Extracts Prepared': parseCommaList,
		'Bloodline Spell-Like Abilities': parseCommaList,
		'Kineticist Wild Talents Spells Known': parseCommaList,
		'Shadowdancer Spell-Like Abilities': parseCommaList,
		'Paladin Spells Prepared': parseCommaList,
		'Cleric Spell-Like Abilities': parseCommaList,
		'Hunter Spells Known': parseCommaList,
		'Magus Spells Prepared': parseCommaList,
		'Investigator Extracts Prepared': parseCommaList,
		'Psychic Magic (Sp)': parseCommaList,
		'Ifrit Spell-Like Abilities': parseCommaList,
		'Invidiak Spell-Like Abilities': parseCommaList,
		'Bloodline Sxpell-Like Abilities': parseCommaList,
		'Opposition Schools': parseCommaList,
		'Mesmerist Spells Known': parseCommaList,
		'Kineticist Wild Talents Known': parseCommaList,
		'Inquisitor Spells Known': parseCommaList,
		'Diviner Spells Prepared': parseCommaList
	});
}

function getMonsterStatistics(entry) {
	return parseBold(entry, {
		Str: value,
		Dex: value,
		Con: value,
		Int: value,
		Wis: value,
		Cha: value,
		'Base Atk': value,
		CMB: parseCommaList,
		CMD: parseCommaList,
		Feats: parseCommaList,
		Skills: parseCommaList,
		Languages: parseCommaList,
		'Racial Modifiers': parseCommaList,
		SQ: parseCommaList,
		Grapple: value,
		Gear: parseCommaList,
		'Combat Gear':parseCommaList,
		'Other Gear':parseCommaList,
		'speak with animals':parseCommaList,
		'alter self':parseCommaList
	});
}

function getMonsterEcology(entry) {
	return parseBold(entry, {
		Environment: parseCommaList,
		Organization: parseCommaList,
		Treasure: parseCommaList,
		Advancement: parseCommaList,
		'Favored Class': parseCommaList,
		'Level Adjustment': parseCommaList
	});
}

function getSpecialAbilities(entry) {
	return getByBold(entry,true);
}

async function loadMonster({name,link},i) {
	debug('Loading Monster',i,name);
	const parsed = await headerBasedTreeRequest({uri:link}, '#ctl00_MainContent_DataListFeats tr td span');
	let top;
	const valid = parsed.children.filter(x=>x.children.filter(y=>y.header).length);
	if(parsed.children.length > 1) {
		const findMatch = n => valid.find(x => x.text.toLowerCase() == n) ||
			valid.find(x => cleanString(n) == cleanString(x.text)) ||
			valid.find(x => x.text.toLowerCase().indexOf(n) != -1) ||
			valid.find(x => n.indexOf(x.text.toLowerCase()) != -1);

		let bestMatch = findMatch(name);
		if(!bestMatch && name.split(',').length > 1) {
			debug('Checking: ',name.split(','));
			const matchString = name.split(',').filter(findMatch);
			if(!matchString.length) throw new Error('Failed to find with: ',name.split(','));
			bestMatch = findMatch(matchString[0]);
			// else throw new Error('Found multiple matches:'+matchString);
		}

		if(!bestMatch) {
			debug(name);
			debug(parsed);
			throw new Error('Failed to find bestmatch');
		}
		top = bestMatch.children;
		debug('bestMatch:',bestMatch.text);
	} else top = parsed.children[0].children;
	debug(top,'parsed',top);
	const description = top.filter(x => !x.header);
	let rest = top.filter(x => x.header);
	if(rest.length > 1) {
		// see if we can narrow it down some more
		rest = [
			rest.filter(x => cleanString(x.text).indexOf(cleanString(name)) != -1),
			rest.filter(x => name.split(',').find(y => {
				return cleanString(x.text).indexOf(cleanString(y)) != -1;
			}))
		].find(x => x.length);
	}
	if(rest.length > 1) {
		console.log(top);
		throw new Error('Multiple rest');
	} else if(!rest.length) {
		console.log(parsed);
		console.log('picked',top);
		throw new Error('No rest');
	}
	rest = rest[0];

	const topLevel = rest.children.filter(x => !x.header);
	const stats = rest.children.filter(x => x.header);

	let fullStats = {};

	stats.forEach(entry => {
		const text = entry.text;
		debug('Checking:',text);
		switch(text) {
		case 'Defense': fullStats.defense = getMonsterDefense(entry); break;
		case 'Offense': fullStats.offense = getMonsterOffense(entry); break;
		case 'Statistics': fullStats.statistics = getMonsterStatistics(entry); break;
		case 'Ecology': fullStats.ecology = getMonsterEcology(entry); break;
		case 'Special Abilities': fullStats.special = getSpecialAbilities(entry); break;
		case 'Tactics': break;
		// case 'Description': fullStats.description = entry; break;
		case 'Description': break;
		default: throw new Error('Invalid entry:'+text);
		}
	});

	return {name,description,topLevel,fullStats};
}

async function loadMonsters(limit) {
	let list = await listMonsters();
	if(limit) list = list.slice(0,limit);
	const ignore = {
		// requires unique parsing
		'hive, hive brute':1,'hive, hive warrior':1,'hive, hive larva swarm':1,'hive, hive queen':1,
		'mummy lord':1,'red reaver':1, 'robot, annihilator robot':1
	};
	list = list.filter(x=>!ignore[x.name]);
	let i=0;
	const stream = es.readArray(list).pipe(through2.obj((monster,enc,cb) => {
		i++;
		loadMonster(monster,i).catch(e => {
			console.log('Failed on:',`${i}/${list.length}`,monster.name,monster.link);
			console.error(e);
			process.exit();
		}).then(m => {
			console.log(JSON.stringify(m));
			setTimeout(() => cb(null,m),0)
		});
	}));
	return new Promise((resolve,reject) => {
		stream.pipe(es.writeArray((e,r) => {
			if(e) return reject(e);
			resolve(r);
		}));
	});
}

async function writeMonsters() {
	const objects = await loadMonsters();
	writeObjectsToFile({type: 'pf_monsters',objects});
}

ifRunningThis(__filename, async () => {
	writeMonsters();
	// const monsters = await loadMonsters();
	// console.log(JSON.stringify(monsters, null, 2));
	// console.log(monsters.length);
});
