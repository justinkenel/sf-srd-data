const cheerio=require('cheerio');
const {scrapeRequest,buildHeaderBasedTree}=require('./base');
const debug=require('debug')('themes.js');

async function listThemes() {
  debug('loading themes');
  const c = await scrapeRequest({
    uri: 'Themes.aspx?ItemName=All'
  });
  let $=cheerio.load(c);
  const rows = $('#ctl00_MainContent_DataListTalentsAll tr');
  if(!rows.length) throw new Error('Expected rows');
  const themes = [];
  rows.each((i,o) => {
    const el = $(o).find('td a').eq(0);
    const name = el.text().trim();
    const link = el.attr('href');
    themes.push({name,link});
  });
  return themes;
}

async function loadTheme({name,link}) {
  debug('Processing', name);
  const c = await scrapeRequest({uri:link});
  let $=cheerio.load(c);
  const content = $('#ctl00_MainContent_DataListTalentsAll_ctl00_LabelName').contents();
  if(!content.length) throw new Error('Missing contents');
  const tree = buildHeaderBasedTree($,content);
  const primary = tree.children[0];

  const header = primary.text;
  const ability_modifier = header.match(/.+\((.+)\)/)[1];

  const firstSectionIndex = primary.children.findIndex(x=>x.header);
  const raw_description = primary.children.slice(0,firstSectionIndex).map(x=>x.text.trim());

  const themeSections = primary.children.filter(x=>x.header);
  const sections = themeSections.map(x => {
    const rawName = x.text.trim();
    const [ability_name,level] = (rawName.match(/(.+) \((.+) Level/)||[]).slice(1);
    return {
      raw: rawName,
      level,
      ability_name,
      raw_description: x.children.map(y=>y.text.trim())
    }
  });
  return {
    name,
    sections,
    raw_description,
    ability_modifier
  };
}

async function loadThemes() {
  const themes = await listThemes();
  return Promise.all(themes.map(loadTheme));
}

module.exports={loadThemes};
