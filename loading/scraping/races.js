const cheerio=require('cheerio');
const {
	scrapeRequest,
	buildHeaderBasedTree,
	writeObjectsToFile,
	ifRunningThis
}=require('./base');
const debug=require('debug')('races.js');

async function listRaces() {
  const c = await scrapeRequest({
    uri: "http://aonsrd.com/Races.aspx?ItemName=All"
  });

  let $=cheerio.load(c);
  const fullListContents = $('#ctl00_MainContent_AllRacesList').contents();
  if(!fullListContents.length) throw new Error('Unable to find list');
  const tree = buildHeaderBasedTree($, fullListContents);

  function buildRaceListItem(t) {
    const{text,getEl}=t;
    if(text == '|') return;
    const name = text;
    const a = getEl().find('a');
    const link = a.attr('href');
    if(!link) return;
    return {name,link};
  }

  const coreRaces = tree.children.find(x=>x.text == 'Core Races');
  const otherRaces = tree.children.find(x=>x.text == 'Other Races');

  return {
    core_races: coreRaces.children.map(buildRaceListItem).filter(x=>x),
    other_races: otherRaces.children.map(buildRaceListItem).filter(x=>x)
  };
}

function getBaseStats($,tree) {
  const primary = tree.children[0];
  const{children}=primary;
  const modifiersIndex = children.findIndex(x=>x.text == 'Ability Modifiers')+1;
  const hitPointsIndex = children.findIndex(x=>x.text == 'Hit Points')+1;
  const descriptionIndex = children.findIndex(x=>x.text == 'Source')+2;

  const modifiers_raw = children[modifiersIndex].text;
  const modifiers = modifiers_raw.split(',').map(x=>x.trim());
  const hit_points = children[hitPointsIndex].text;
  const raw_description = children.slice(descriptionIndex, Math.min(modifiersIndex,hitPointsIndex)-1).map(x=>x.text);

  const sizeAndType = children.find(x=>x.text == 'Size and Type') || {children:[{text:''}]};
  const [size,type,subtype] = (sizeAndType.children[0].text.match(/are (\w+) (\w+) (?:with|and have) the (\w+) subtype/)||[]).slice(1);

  if(!size) debug('no size found in:',sizeAndType.children[0].text);

  return {
    modifiers,
    modifiers_raw,
    hit_points,
    raw_description,
    size,
    type,
    subtype
  };
}

function getRaceFeatures($,tree) {
  const primary = tree.children[0];
  const{children}=primary;

  const features = children
    .filter(x=>x.header)
    .map(x=>{
      const{text,children}=x;
      return {
        name:text,
        raw_description: children.map(x=>x.text)
      }
    });
  return features;
}

async function loadRace(options) {
  const{name,link}=options;
  debug('Processing',name);
  const c = await scrapeRequest({uri:link});
  let $=cheerio.load(c);
  const definition=$('#ctl00_MainContent_DataListTalentsAll_ctl00_LabelName').contents();
  if(!definition.length) throw new Error('Failed to find definition');

  const tree = buildHeaderBasedTree($,definition);

  const base_stats = getBaseStats($,tree);
  const race_features = getRaceFeatures($,tree);

  return {
    // tree,
    name,
    base_stats,
    race_features
  };
}

async function loadRaces(options) {
  const races = await listRaces(options);
  return Promise.all(races.core_races.concat(races.other_races).map(loadRace));
}


async function writeRaces() {
	const objects = await loadRaces();
	writeObjectsToFile({type:'races', objects});
}
ifRunningThis(__filename, writeRaces);

module.exports={writeRaces};
