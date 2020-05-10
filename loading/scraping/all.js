const {loadClasses}=require('./classes');
const {loadSkills}=require('./skills');
const {loadFeats}=require('./feats');
const {loadRaces}=require('./races');
const {loadSpells}=require('./spells');
const {loadThemes}=require('./themes');
const {loadTemplates}=require('./templates');
const {loadProperties}=require('./properties');
const {
	loadAliens,
	loadSizes,
	loadUniversalMonsterRules
}=require('./aliens');
const {loadArmors,loadWeapons,loadAmmunitions}=require('./equipment');
const {loadMonsterArrays}=require('./monster_arrays');
const starships=require('./starships'),{loadBaseFrames}=starships;
const buildAbilities=require('./abilities');

module.exports = async function loadAll() {
	const feats = await loadFeats();
	const skills = await loadSkills();
	const properties = await loadProperties();
	const spells = await loadSpells();

	const skillsByName = {};
	skills.forEach(x=>skillsByName[x.name.toLowerCase()]=x);

	const spellsByName={};
	spells.forEach(x=>spellsByName[x.name.toLowerCase()]=x);

	const aliens = await loadAliens();
	// const sizes = await loadSizes();
	const universal_monster_rules=await loadUniversalMonsterRules();

	const races = await loadRaces({
		skillsByName,
		spellsByName
	});

  const types = {
		properties,
    feats,
    skills,
    spells,
		races,
		aliens,
		// sizes,
		universal_monster_rules,
		starship_armor: await starships.loadArmors(),
		starship_computers: await starships.loadComputers(),
		base_frames: await loadBaseFrames(),
		ammunitions: await loadAmmunitions(),
		armors: await loadArmors(),
		// monster_arrays: await loadMonsterArrays(),
    themes: await loadThemes(),
		templates: await loadTemplates(),
		// starship_tiers: await starships.loadTiers(),
		starship_thrusters: await starships.loadThrusters(),
		starship_power_cores: await starships.loadPowerCores(),
		starship_weapons: await starships.loadWeapons()
  };

	const weapons = await loadWeapons();
	weapons.forEach(w => {
		const{type,weapons}=w;
		types['weapons/'+type]=weapons;
	})

  const classes = await loadClasses({skillsByName});
  classes.forEach(cl => {
    const name = cl.name.toLowerCase();
    types['classes/'+name] = cl;
  });

	const abilities = await buildAbilities(types);
	types.abilities = abilities;

	return types;
}
