const cheerio=require('cheerio');
const {scrapeRequest,buildHeaderBasedTree,
	getUntil,
	// getBetween,getAfter,
	getPostText}=require('./base');
const debug=require('debug')('templates.js');

async function listTemplateTypes() {
	const c = await scrapeRequest({
		uri: 'TemplateGrafts.aspx?ItemName=All&Family=None'
	});
	let $=cheerio.load(c);
	const contents = $('#ctl00_MainContent_DataListExamples_ctl00_LabelName').contents();
	const tree = buildHeaderBasedTree($,contents);
	return tree;
}

async function getCreatureType(o) {
	const {text,link}=o;
	const name = text.trim();
	const c = await scrapeRequest({
		uri: link
	});
	let $=cheerio.load(c);
	const contents = $('#ctl00_MainContent_DataListExamples tr td span').contents();
	const [tree] = buildHeaderBasedTree($,contents).children;

	const definition = tree.children.find(x => x.header == 2);
	if(!definition) debug('Mising for',name);

	const raw_description = getUntil(definition, 'traits').map(x=>x.text.trim());
	const traits = getPostText(definition, 'traits');
	const adjustments = getPostText(definition, 'adjustments');

	return {
		name,
		traits,
		adjustments,
		raw_description,
		// definition
	};
}

async function loadTemplates() {
	const types = await listTemplateTypes();
	// const class_grafts = types.children.find(x => x.text == 'Class Grafts');
	const creature_type = types.children.find(x => x.text == 'Creature Type Grafts');
	// const creature_sub_type = types.children.find(x => x.text == 'Creature Subtype Grafts');
	// const environment = types.children.find(x => x.text == 'Environmental');

	return {
		creature_type: await Promise.all(creature_type.children.filter(x=>x.link).map(getCreatureType))
	};

	// return (await listTemplateTypes()).map(async type => {
	// 	const name = type.text.trim();
	// 	const templates = await Promise.all(type.children.map(c => {
	// 		if(c.link) return getTemplate({
	// 			name: c.text.trim(),
	// 			link:c.link
	// 		});
	// 		return null;
	// 	})).filter(x=>x);
	// 	return {
	// 		name,
	// 		templates
	// 	}
	// });
}

module.exports = {
	loadTemplates: loadTemplates
};
