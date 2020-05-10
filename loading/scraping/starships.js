const {headerBasedTreeRequest,
  getByBold,
  parseTableBasedTrequest, fullTransform
}=require('./base');
const debug=require('debug')('starships.js');

const clean=(x) => x.map(y=>y.text).join('').split(';').filter(x=>!!x);
const value=(x,k) => {
  if(!x) return undefined;
	if(!Array.isArray(x)) x = [x];
  const c = clean(x);
  if(c.length != 1) throw new Error("Expected single value: "+JSON.stringify(c)+" for "+k);
  return c[0];
};

const getHp = (node) => {
  const hp = (node.hp || node)[0];
  const [base,increment]=hp.text.match(/(\d+)\s+\(increment\s+(\d+)\)/).slice(1);
  if(!base || !increment) throw new Error("Invalid: "+hp.text);
  return {base,increment};
}

function parseBaseFrame(node) {
  const parsed = getByBold({
    children: node.children.filter(x => !x.header)
  });
  const specialAbilities = node.children.find(x => x.header && x.text == 'Special Abilities');
  const t = fullTransform(parsed,{
    source:'Source',
    size:'Size',
    maneuverability:'Maneuverability',
    hp: 'HP',
    dt: 'DT',
    ct: 'CT',
    mounts: 'Mounts',
    expansion_bays: 'Expansion Bays',
    minimum_crew: 'Minimum Crew',
    maximum_crew: "Maximum Crew",
    cost: "Cost"
  });
  return {
    name: node.text.trim(),
    source_raw:t.source,
    size:value(t.size),
    maneuverability:value(t.maneuverability),
    hp: getHp(t),
    dt: value(t.dt),
    ct: value(t.ct),
    mounts_raw: t.mounts,
    expansion_bays_raw: t.expansion_bays,
    minimum_crew: value(t.minimum_crew),
    maximum_crew: value(t.maximum_crew),
    cost: value(t.cost),
    special_raw: specialAbilities
  };
}

async function loadBaseFrames() {
  const tree = await headerBasedTreeRequest(
    'Starship_BaseFrames.aspx?ItemName=All',
    '#ctl00_MainContent_DataListAll tr td span'
  );
  // const [prime]=tree.children;
  // if(prime.text != 'Base Frames') throw new Error("Expected 'Base Frames', not "+prime.text);
  if(!tree.children.length) throw new Error("No frames found");
  // debug(JSON.stringify(tree.children));
  const frames = tree.children
    .filter(x=>x.header)
    .map(x=>{
      // debug("Processing:",x);
      return parseBaseFrame(x);
    });
  return frames;
}

const parseArmorCost = (cost) => {
  const [multiplier] = cost.text.match(/(\d+) x size category/).slice(1);
  if(!multiplier) throw new Error("Invalid: "+cost);
  return multiplier;
};
async function loadArmors() {
  const armors = await parseTableBasedTrequest('Starship_Armor.aspx',
    '#ctl00_MainContent_GridView_Armor tr');
  if(!armors.length) throw new Error("Failed to get armor");
  return armors.map(raw => {
    return {
      name: value([raw.name]),
      ac_bonus: value([raw['bonus to ac']]),
      special_raw: raw.special,
      cost_multiplier: parseArmorCost(raw['cost (in bp)'])
    };
  });
}

async function loadComputers() {
  const computers = await parseTableBasedTrequest("Starship_Computers.aspx",
    "#ctl00_MainContent_GridView_Computers tr");
  return computers.map(raw => {
    return {
      name: value([raw.name]),
      bonus_raw: raw.bonus, //: value([raw.bonus]),
      nodes: value([raw.nodes]),
      pcu: value([raw.pcu]),
      cost: value([raw['cost (in bp)']])
    }
  });
}

async function loadTiers() {
  const tiers = await parseTableBasedTrequest("Rules.aspx?Name=Building a Starship&Category=Building Starships",
    "#ctl00_MainContent_RulesResult table.inner tr");
  return tiers.map(raw=>{
    return {
      tier: value([raw.tier]),
      bp: value([raw['starship build points']]).replace(/[^\d]/g,''),
      special: clean([raw.special])
    };
  });
}

async function loadThrusters() {
	const thrusters = await parseTableBasedTrequest("Starship_Thrusters.aspx",
		'#ctl00_MainContent_GridView_Thrusters tr');
	debug('processing',thrusters.length,'thrusters');
	return thrusters.map(raw => {
		return {
			name: value(raw.core),
			size: value(raw.size),
			speed: value(raw['speed (in hexes)']),
			piloting_modifier: value(raw['piloting modifier']),
			pcu: value(raw['PCU']),
			cost: value(raw['cost (in bp)'])
		}
	});
}

async function loadPowerCores() {
	const cores = await parseTableBasedTrequest('Starship_PowerCores.aspx',
		'#ctl00_MainContent_GridView_PowerCores tr');
	return cores.map(raw => {
		return {
			name: value(raw.core),
			sizes: value(raw.size).split(',').map(s=>s.trim()),
			pcu: value(raw.pcu),
			cost: value(raw['cost (in bp)'])
		};
	});
}

async function loadWeaponsOfType(table,size) {
	const weapons = await parseTableBasedTrequest('Starship_Weapons.aspx',`#${table} tr`);
	return weapons.map(raw => ({
		name: value(raw.weapon),
		size,
		type: value(raw.type),
		range: value(raw.range),
		speed: value(raw['speed (in hexes)']),
		damage: value(raw.damage),
		pcu: value(raw.pcu),
		cost: value(raw['cost (in bp)']),
		special_properties_raw: value(raw['special properties'])
	}));
}

async function loadWeapons() {
	const light = await loadWeaponsOfType('ctl00_MainContent_GridView_Starship_WeaponsLight','light');
	const heavy = await loadWeaponsOfType('ctl00_MainContent_GridView_Starship_WeaponsHeavy','heavy');
	const capital = await loadWeaponsOfType('ctl00_MainContent_GridView_Starship_WeaponsCapital','capital');
	const spinal = await loadWeaponsOfType('ctl00_MainContent_GridView_Starship_WeaponsSpinal','spinal');
	return {
		light,heavy,capital,spinal
	};
}

module.exports={
  loadBaseFrames,
  loadArmors,
  loadComputers,
  loadTiers,
	loadThrusters,
	loadPowerCores,
	loadWeapons
};
