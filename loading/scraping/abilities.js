const{
	parseSemicolonList,ifRunningThis,
	writeObjectsToFile
}=require('./base');

const {
	loadUniversalMonsterRules,
	loadAliens
}=require('./aliens');

async function buildAbilities() {
  const abilities={};

  function saveAbility(ability) {
    if(!ability.name) throw new Error('Each ability needs a name');
    if(abilities[ability.name]) throw new Error('Ability with name '+ability.name+' already exists');
    abilities[ability.name]=ability;
  }

	const universal_monster_rules=await loadUniversalMonsterRules();

  const umrFormatToTypeMap={
    Aura: 'aura',
   'Defensive Abilities': 'defensive',
   'Other Abilities': 'other',
   Melee: 'melee',
   Senses: 'sense',
   'Offensive Abilities': 'offensive',
   Immunities: 'immunity',
   Weaknesses: 'weakness',
   Speed: 'speed',
   Languages: 'language',
   Multiattack: 'multiattack',
   Resistances: 'resistance',
   SR: 'spell_resistance',
   'Spell-Like Abilities': 'spell'
 };
  universal_monster_rules.forEach(rule => {
    const{name,description,format}=rule;
    const types = {};
    let formatText;
    Object.keys(format).forEach(raw => {
      if(!umrFormatToTypeMap[raw])throw new Error("No type mapping for "+raw);
      formatText = parseSemicolonList(format[raw][0].text)[0];
      if(!formatText) console.log(format[raw]);
      types[umrFormatToTypeMap[raw]]=1;
    });
    // if(types.length > 1) console.log('extra for',name);
    saveAbility({
      name,
      ability_source: 'universal_monster_rule',
      description:description.join(' '),
      types,
      format:formatText
    });
  });

  const aliens = await loadAliens();
	console.log("Loading aliens");
  aliens.forEach(alien => {
    const {special_abilities=[]}=alien.stat_block||{};
    if(!special_abilities.length) return;
    special_abilities.forEach(x => {
      if(abilities[x.name]) {
        // console.log('already exists:',x.name);
      } else {
        const types={};
        (x.types||[]).forEach(type=>types[type]=1);
        saveAbility({
          name: x.name,
          ability_source: 'alien_abilities',
          description: x.description,
          types,
          format: x.format,
        });
      }
    });
  });

  return Object.keys(abilities).map(x=>abilities[x]);
}

module.exports={buildAbilities,writeAbilitiesToFile};

async function writeAbilitiesToFile() {
	const objects = await buildAbilities();
	await writeObjectsToFile({objects,type: 'abilities'});
}
ifRunningThis(__filename, writeAbilitiesToFile);
