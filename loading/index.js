const fs = require('fs');
const path=require('path');
const scrapeAll = require('./scraping/all');

async function writeAllToFile() {
	const scraped = await scrapeAll();

	const types = scraped;

  return Object.keys(types).map(type => {
    fs.writeFileSync(path.join(__dirname,'../objects/',type+'.json'),
      JSON.stringify(types[type],null,2));
    return {
      type,
      count: types[type].length
    }
  });
}

// eslint-disable-next-line
writeAllToFile().then(r => console.log(JSON.stringify(r))).catch(e => console.error(e));
