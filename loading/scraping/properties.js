const {headerBasedTreeRequest,
	getPostText,getRest}=require('./base');
const debug=require('debug')('properties.js');

async function listWeaponSpecialProperties() {
	const tree = await headerBasedTreeRequest({
		uri: 'WeaponProperties.aspx?ItemName=All'
	}, '#ctl00_MainContent_DataListTalentsAll tr td span');
	debug('tree:',tree);
	return tree.children.map(x => {
		const name = x.text.trim();
		debug('Handling',name);
		const raw_description = x.children.map(x => x.text);
		const source = getPostText(x,'source');
		const description = getRest(x,source.toLowerCase()).map(x=>x.text.trim());
		return {name,raw_description,source,description};
	});
	// return tree;
}

async function listDescriptors() {
	const tree = await headerBasedTreeRequest({
		uri: 'Rules.aspx?ID=156'
	}, "#ctl00_MainContent_RulesResult");
	const descriptors = tree.children.find(x=>x.text == 'Descriptors');
	if(!descriptors) throw new Error('failed to get descriptors');
	return descriptors.children.filter(x=>x.header == 3).map(d => {
		const name = d.text.trim();
		debug('handling',name);
		const description = d.children.map(x=>x.text.trim());
		return {
			name,
			description
		};
	});
}

async function loadProperties() {
	const weapon_special_properties = await listWeaponSpecialProperties();
	return {
		weapon_special_properties,
		// descriptors: await listDescriptors()
	};
}

module.exports={
	loadProperties
};
