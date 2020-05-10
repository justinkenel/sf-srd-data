const cheerio=require('cheerio');
const {
	scrapeRequest,
	writeObjectsToFile,ifRunningThis
}=require('./base');
const debug=require('debug')('skills.js');

const ability_modifiers = [
  'cha','str','wis','int','dex','con'
];

async function loadSkills() {
  const c = await scrapeRequest({
    uri: 'Skills.aspx?ItemName=All'
  });
  let $=cheerio.load(c);
  const skillRows = $('#ctl00_MainContent_DataListTalentsAll tr td span');
  const skills = [];
  skillRows.each((i,o) => {
    const el = $(o);
    const td = el.contents();
    // if(td.length > 3) throw new Error('Expected 3, got: '+td.length);
    const h2 = td[0];
    if(h2.tagName != 'h2') {
      debug(h2.tagName);
      throw new Error('Expected first to be h2, not: '+h2.tagName);
    }
    const raw_name = $(h2).text();
    const trained_only = raw_name.toLowerCase().indexOf('trained only') != -1;
    const armor_check_penalty = raw_name.toLowerCase().indexOf('armor check penalty') != -1;
    const raw_description = td.slice(1).toArray().map(x=>$(x).text().trim()).filter(x=>x);
    const modifiers = ability_modifiers.filter(x => raw_name.toLowerCase().match(new RegExp(x+'[\\s\\;\\)\\,]')));
    const name = raw_name.split('(')[0].trim();
    skills.push({
      name,
      raw_name,
      trained_only,
      armor_check_penalty,
      raw_description,
      modifiers
    });
  });
  return skills;
}

async function writeSkills() {
	const objects = await loadSkills();
	writeObjectsToFile({type:'skills', objects});
}
ifRunningThis(__filename, writeSkills);

module.exports={loadSkills,writeSkills};
