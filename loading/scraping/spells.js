const cheerio=require('cheerio');
const {scrapeRequest,buildHeaderBasedTree,
  getUntil,getBetween,
	parseBold,parseCommaList,getSingleValue,

	writeObjectsToFile, ifRunningThis,
}=require('./base');
const debug=require('debug')('spells.js');

// http://aonsrd.com/Spells.aspx?Class=All

async function listSpells() {
  const c = await scrapeRequest({uri: 'Spells.aspx?Class=All'});
  let $=cheerio.load(c);
  const rows = $('#ctl00_MainContent_DataListTalentsAll tr');
  if(!rows.length) throw new Error('no rows found');
  debug('processing',rows.length);
  const spells = [];
  rows.each((i,o) => {
    const el=$(o).find('td a').eq(0);
    const name = el.text().trim();
    const link = el.attr('href');
    spells.push({name,link});
  });
  return spells;
}

const levelWords = ['','1st','2nd','3rd','4th','5th','6th'];
async function getSpellDefinition({name,link}) {
  const c = await scrapeRequest({uri: link});
  let $=cheerio.load(c);
  const parts = $('#ctl00_MainContent_DataListTalentsAll tr td span').contents();
  const tree = buildHeaderBasedTree($,parts);
  if(tree.children.length != 1) {
		debug(link,'Expected only one section:',name,tree.children);
	}
  const [primary]=tree.children;

  if(!primary) return {}  ;

  if(primary.text != name) throw new Error("Name mismatch");

	const beforeDescription = getUntil(primary, 'description');
	const info = parseBold(beforeDescription,{
		Source: x=>x,
		Classes: parseCommaList,
		School: getSingleValue,
		Range: getSingleValue,
		'Casting Time': getSingleValue,
		Target: getSingleValue,
		'Targets or Area': getSingleValue,
		'Area or Targets': getSingleValue,
		Targets: getSingleValue,
		Area: getSingleValue,
		'Area, Effect, or Targets': getSingleValue,
		'Targets, Effect, or Area': getSingleValue,
		'Effect, Area, or Targets': getSingleValue,
		Duration: getSingleValue,
		Effect: getSingleValue,
		'Saving Throw': getSingleValue,
		'Spell Resistance': getSingleValue
	});

	const classes = {};
	let levelString='';
	info.Classes.forEach(x => {
		const[c,level]=x.split(/\s+/);
		classes[c]=level;
		levelString=levelString || level;
	});

  const school = info.School
  const casting_time = info['Casting Time'];
  const range = info.Range; // getPostText(primary, 'range');

	const areaEffectOrTargets = info['Area, Effect, or Targets'] ||
		info['Targets, Effect, or Area'] || info['Effect, Area, or Targets'];
	const targetsOrArea = info['Targets or Area'] || info['Area or Targets'] || areaEffectOrTargets;

	const targets = info.Target || info.Targets || targetsOrArea;
	const area = info.Area || targetsOrArea;
	const effect = info.Effect || areaEffectOrTargets;

  const duration = info.Duration;
  const saving_throw = info['Saving Throw'];
  const spell_resistance = info['Spell Resistance'];

  const descriptionNode = primary.children.find(x=>x.text == 'Description');
  let raw_description;
  if(descriptionNode) raw_description = descriptionNode.children.map(x=>x.text.trim());
  else debug('No description for',name);

  let levels=[];
  let [start,end]=levelString.split('-').map(x=>parseInt(x));
  levels.push(start);
  if(end) {
    while(start < end) levels.push(++start);
  }

  let per_level_raw_description;
  if(levels.length > 1) {
    per_level_raw_description=[];
    const specifics = levels.map(x=>levelWords[x]);
    specifics.forEach((s,i) => {
      const e = specifics[i+1];
      const parts = getBetween(descriptionNode,s,e)
      // debug(s,e,parts);
      per_level_raw_description.push({
        level: s,
        raw_description: parts.map(x=>x.text.trim())
      });
    });
    raw_description = getUntil(descriptionNode, specifics[0]);
  }

  return {
		info,
    // tree,
    name,
    // class:cl,
		classes,
    levels,
    school,
    casting_time,
    range,
    // target,
		area,
		effect,
		targets,
    duration,
    saving_throw,
    spell_resistance,
    raw_description,
    per_level_raw_description
  };
}

async function loadSpells() {
  const spells = await listSpells();
  return Promise.all(spells.map(async x => await getSpellDefinition(x)));
}


async function writeSpells() {
	const objects = await loadSpells();
	writeObjectsToFile({type:'spells', objects});
}

ifRunningThis(__filename, writeSpells);

module.exports={
  writeSpells
};
