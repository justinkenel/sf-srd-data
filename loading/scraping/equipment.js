const {headerBasedTreeRequest,
  parseBold,getByBold,
  parseTableBasedRequest, fullTransform,parseModifier,
  ifRunningThis,writeObjectsToFile, parseCommaList
}=require('./base');
const debug=require('debug')('equipment.js');

const clean=(x) => x.map(y=>y.text).join('').split(';').filter(x=>!!x);
const value=(x,k) => {
  if(!x) return undefined;
  const c = clean(x);
  if(c.length != 1) throw new Error("Expected single value: "+JSON.stringify(c)+" for "+k);
  return c[0];
};

function parseArmorStats(stats) {
  return parseBold(stats, value);
}

function getStatsAndDescription(text,prime) {
  let raw_description;
  let raw_stats;

  const hybridText = text + ' (hybrid)';

  if(prime.text.toLowerCase() == text || prime.text.toLowerCase() == hybridText) {
    raw_description = prime.children.find(x => x.text == 'Description');
    const statNodes = prime.children.filter(x => !x.header);
    if(statNodes.length) raw_stats = {children:statNodes};
  }
  if(!raw_stats) {
    raw_description = prime.children.filter(x=>!x.header) || raw_description;
    raw_stats = prime.children.find(x => x.text.toLowerCase() == text || x.text.toLowerCase() == hybridText);
  }

  if(!raw_stats) debug(text, prime.children.map(x=>x.text));

  return {raw_description,raw_stats};
}

async function loadArmor({name}) {
  const{text,link}=name;
  if(!link) throw new Error("No link for "+text);
  const tree = await headerBasedTreeRequest(link,'#ctl00_MainContent_DataListTalentsAll_ctl00_LabelName');
  if(!tree.children) {
    debug(text,JSON.stringify(tree));
    throw new Error("No children for: "+text);
  }
  const [prime]=tree.children;

  const {raw_description,raw_stats} = getStatsAndDescription(text,prime);

  let stats;
  try {
    const base = parseArmorStats(raw_stats);
    stats = fullTransform(base, {
      source: "Source",
      level: "Level",
      price: "Price",
      category: "Category",
      eac_bonus_raw: "EAC Bonus",
      kac_bonus_raw: "KAC Bonus",
      max_dex_bonus_raw: "Max. Dex Bonus",
      armor_check_penalty: "Armor Check Penalty",
      speed_adjustment: "Speed Adjustment",
      upgrade_slots: "Upgrade Slots",
      bulk: "Bulk"
    });

    const {eac_bonus_raw,kac_bonus_raw,max_dex_bonus_raw}=stats;

    stats=Object.assign({},stats,{
      eac_bonus:parseModifier(eac_bonus_raw),
      kac_bonus: parseModifier(kac_bonus_raw),
      max_dex_bonus: parseModifier(max_dex_bonus_raw)
    });
  } catch(e) {
    debug('failed for: '+text);
    throw e;
  }

  return {
    name:name.text,
    raw_description,
    stats,
    // raw_stats
  };
}

async function loadArmorsForType({uri}) {
  const rows = await parseTableBasedRequest(uri,'table#ctl00_MainContent_GridViewArmor tr');
  return await Promise.all(rows.map(loadArmor));
}

async function loadArmors() {
  const light = await loadArmorsForType({uri:"Armor.aspx?Category=Light"});
  const heavy = await loadArmorsForType({uri:"Armor.aspx?Category=Heavy"});
  return light.map(x => Object.assign({},x,{armor_type:'light'}))
    .concat(heavy.map(x => Object.assign({},x,{armor_type:'heavy'})))
    .map(x => Object.assign({},x,{equipment_type:'armor'}));
}

async function loadWeapon(row) {
  const {name}=row;
  if(!name) debug("missing from: "+JSON.stringify(row));
  const{text,link}=name;
  if(!link) throw new Error("No link for "+text);
  const tree = await headerBasedTreeRequest(link,'#ctl00_MainContent_DataListTalentsAll_ctl00_LabelName');
  if(!tree.children) {
    debug(text,JSON.stringify(tree));
    throw new Error("No children for: "+text);
  }
  const [prime]=tree.children;
  const {raw_stats,raw_description}=getStatsAndDescription(text,prime);
  let stats;
  try {
    const base = fullTransform(getByBold(raw_stats), {
      source: "Source",
      level: "Level",
      price: "Price",
      damage: "Damage",
      critical: "Critical",
      bulk: "Bulk",
      special: "Special",

      hands: 'Hands',
      proficiency: 'Proficiency',

      // non-melee
      range: 'Range',
      capacity: 'Capacity',
      usage: 'Usage'
    });
		const raw_special=base.special;
		let special = parseCommaList(raw_special.map(x=>x.text).join(' '));
		if(special.slice(-'Description'.length)=='Description') {
			special = special.slice(0,-'Description'.length);
		}

		const powered = special.find(x=>x.toLowerCase().indexOf('powered ')==0);
		if(powered && !base.capacity && name.text.indexOf('plasma lash')!=0) {
			const [capacity,usage]=(powered.match(/\s*powered\s*\(capacity\s+(\d+)\s*[;,]\s*usage\s+(\d+)\)/i) || []).slice(1);
			if(!capacity||!usage) {
				console.log({capacity,usage});
				console.log(name,'failed to parse',JSON.stringify(powered));
			}
			base.capacity=[{text:capacity}];
			base.usage=[{text:usage}];
		}

		let bab_modifier='';
		const thrown=special.find(x=>x.toLowerCase().indexOf('thrown')==0);
		if(thrown) bab_modifier='thrown';

    stats = {
      source: value(base.source),
      level: value(base.level),
      price: value(base.price),
      damage: value(base.damage),
      critical: value(base.critical),
      bulk: value(base.bulk),
      raw_special: base.special,
			special,

      hands: value(base.hands),
      proficiency: value(base.proficiency),

			bab_modifier,

      // heavy
      range: value(base.range),
      missing_range: value(base.missing_range),
      capacity: value(base.capacity),
      usage: value(base.usage)
    };
    // stats = fullTransform(base, {
    //   source: "Source",
    //   level: "Level",
    //   price: "Price",
    //   category: "Category",
    //   eac_bonus: "EAC Bonus",
    //   kac_bonus: "KAC Bonus",
    //   max_dex_bonus: "Max. Dex Bonus",
    //   armor_check_penalty: "Armor Check Penalty",
    //   speed_adjustment: "Speed Adjustment",
    //   upgrade_slots: "Upgrade Slots",
    //   bulk: "Bulk"
    // });
  } catch(e) {
    debug('failed for: '+text);
    debug(JSON.stringify());
    debug(JSON.stringify(prime,null,2));
    throw e;
  }

  return {
    name:text,
    stats,
    // raw_stats,
    raw_description
  };
}

async function loadWeaponsForType({type,uri,bab_modifier}) {
  const rows = await parseTableBasedRequest(uri,'table#ctl00_MainContent_GridViewWeapons1Hand tr,table#ctl00_MainContent_GridViewWeapons2Hands tr');
	const weapons = await Promise.all(rows.filter(x=>x.name)
		.map(loadWeapon));
  return {
    type,
    weapons: weapons.map(x=>{
				x.stats.bab_modifier=x.stats.bab_modifier||bab_modifier;
				return x;
			})
  };
}

async function loadWeapons() {
  return Promise.all([{
    type: "advanced_melee",
    uri: "Weapons.aspx?Proficiency=AdvMelee",
		bab_modifier: 'melee',
  },{
    type: "basic_melee",
    uri: "Weapons.aspx?Proficiency=BasicMelee",
		bab_modifier: 'melee'
  },{
    type: "heavy",
    uri: "Weapons.aspx?Proficiency=Heavy",
		bab_modifier: 'ranged'
  },{
    type: "longarms",
    uri: "Weapons.aspx?Proficiency=Longarms",
		bab_modifier: 'ranged'
  },{
    type: 'small_arms',
    uri: "Weapons.aspx?Proficiency=SmallArms",
		bab_modifier: 'ranged'
  },{
    type: 'snipers',
    uri: "Weapons.aspx?Proficiency=Sniper",
		bab_modifier: 'ranged'
  },{
    type: 'special',
    uri: "Weapons.aspx?Proficiency=Special",
		bab_modifier: 'ranged'
  },{
    type: 'grenades',
    uri: "Weapons.aspx?Proficiency=Grenade",
		bab_modifier: 'thrown'
  }].map(loadWeaponsForType));
}

async function loadAmmunition({name}) {
    const{text,link}=name;
    if(!link) throw new Error("No link for "+text);
    const tree = await headerBasedTreeRequest(link,'#ctl00_MainContent_DataListTalentsAll_ctl00_LabelName');
    if(!tree.children) {
      debug(text,JSON.stringify(tree));
      throw new Error("No children for: "+text);
    }
    const [prime]=tree.children;
    const {raw_stats,raw_description}=getStatsAndDescription(text,prime);
    let stats;
    try {
      const base = fullTransform(getByBold(raw_stats), {
        source: "Source",
        level: 'Level',
        price: 'Price',
        damage: 'Damage',
        critical: 'Critical',
        capacity: 'Capacity',
        bulk: 'Bulk',
        special: 'Special',

        hands: 'Hands',
        proficiency: 'Proficiency'
      });
      stats = {
        source: value(base.source),
        level: value(base.level),
        price: value(base.price),
        damage: value(base.damage),
        critical: value(base.critical),
        bulk: value(base.bulk),

        hands: value(base.hands),
        proficiency: value(base.proficiency),

        special_raw: base.special
      };
    } catch(e) {
      console.log('failed for: '+text);
      throw e;
    }

    return {
      name:text,
      stats,
      // raw_stats,
      raw_description
    };
}

async function loadAmmunitions() {
  const rows = await parseTableBasedRequest('Weapons.aspx?Proficiency=Ammo', 'table#ctl00_MainContent_GridViewWeapons1Hand tr');
  const ammunitions = await Promise.all(rows.map(loadAmmunition));
  return ammunitions.map(a => {
    return Object.assign({},a,{equipment_type:'ammunition'});
  });
}

async function loadAugmentation({name:{text,link}}, internal) {
  if(!link) throw new Error("No link for "+text);
  let tree;
  try {
    tree = await headerBasedTreeRequest(link,internal);
  } catch(e) {
    tree = await headerBasedTreeRequest(link,'');
  }

  let [match] = tree.children;
  let description;
  if(match.text.toLowerCase() != text) {
    // this is a multiple item page
    match = match.children.find(x => x.header && x.text.toLowerCase() == text);
    if(!match) {
      console.log(JSON.stringify(tree,null,2));
      throw new Error('failed to find row match');
    }
    description = tree.children[0].children[0].text;
  }

  const results = fullTransform(parseBold(match, {
    Source: x => x[0],
    'Item Level': value,
    Price: value,
    System: value,
    'Ability Modifier': value,
    _after: x => x
  }, {end_line_break:true}), {
    source: 'Source',
    level: 'Item Level',
    price: 'Price',
    system: 'System',
    'ability_modifier': 'Ability Modifier',
    after: '_after'
  });

  description = description || clean(results.after.System).join('\n');

  const {source,level,price,system}=results;

  return {
    name: text, description,
    source,level,price,system
  };

}

async function loadAugmentationsOfType({selector,uri, internal}) {
  const rows = await parseTableBasedRequest(uri,selector);
  return await Promise.all(rows.map(async x => {
    try {
      return await loadAugmentation(x, internal);
    } catch(e) {
      console.error('failed on',x);
      throw e;
    }
  }));
}

async function loadAugmentations() {
  const augs = [];
  await Promise.all([{
    type:'biotech',
    uri: "Biotech.aspx?ItemName=All&Family=None",
    selector: "table#ctl00_MainContent_GridViewBiotech tr",
    internal: '#ctl00_MainContent_DataListBiotech tr td span'
  },{
    type:'cybernetics',
    uri: "Cybernetics.aspx?ItemName=All&Family=None",
    selector: "table#ctl00_MainContent_GridViewCybernetics tr",
    internal: '#ctl00_MainContent_DataListCybernetics tr td span'
  },{
    type:'magitech',
    uri: "Magitech.aspx?ItemName=All&Family=None",
    selector: "table#ctl00_MainContent_GridViewMagitech tr",
    internal: '#ctl00_MainContent_DataListMagitech tr td span'
  },{
    type:'personal_upgrade',
    uri: 'PersonalUpgrades.aspx?ItemName=All&Family=None',
    selector: "table#ctl00_MainContent_GridViewPersonalUpgrades tr",
    internal: '#ctl00_MainContent_DataListPersonalUpgrades tr td span'
  }].map(async def => {
    const l = await loadAugmentationsOfType(def);
    l.forEach(x=>augs.push(x));
  }));
  return augs;
}

async function loadItem({name:{text,link}}, internal) {
  if(!link) throw new Error("No link for "+text);
  let tree;
  tree = await headerBasedTreeRequest(link,internal);

  let [match] = tree.children;

  const subMatch = match.children.find(x => x.header && x.text.toLowerCase() == text)
    || tree.children.find(x => x.header && x.text.toLowerCase() == text);

  let description;

  if(subMatch) {
    // this is a multiple item page
    match=subMatch;
    if(!match) {
      console.log(JSON.stringify(tree,null,2));
      throw new Error('failed to find row match');
    }
    description = tree.children[0].children[0].text;
  }

  const descriptionRaw = match.children.find(x => x.header && x.text == 'Description');
  if(descriptionRaw) description = descriptionRaw.children.map(x=>x.text).join(' ');

  if(!description) {
    console.log(JSON.stringify(descriptionRaw,null,2));
    throw new Error("No description found");
  }


  const results = fullTransform(parseBold(match, {
    Source: x => x[0],
    'Level': value,
    Price: value,
    Bulk: value,
    Hands: value,
    Capacity: value,
    Usage: value,
    _after: () => undefined
  }, {end_line_break:true,ignore_header:true}), {
    source: 'Source',
    level: 'Level',
    price: 'Price',
    bulk: 'Bulk',
    hands: 'Hands',
    capacity: 'Capacity',
    usage: 'Usage',
    _after: '_after'
  });

  const {source,level,price,hands,bulk, capacity,usage}=results;

  return {
    name: text, description,
    source,level,price,bulk,
    hands,capacity,usage
  };
}

async function loadItemsOfType({selector,uri, internal}) {
  const rows = await parseTableBasedRequest(uri,selector);
  return await Promise.all(rows.filter(
    x => x.name.link.indexOf('Family=Domestic Drone') == -1
  ).map(async x => {
    try {
      return await loadItem(x, internal);
    } catch(e) {
      console.error('failed on',x);
      throw e;
    }
  }));
}
async function loadItems() {
  const items = [];
  await Promise.all([{
    type:'hybrid',
    uri: "HybridItems.aspx?ItemName=All&Family=None",
    selector: "table#ctl00_MainContent_GridViewHybridItems tr",
    internal: '#ctl00_MainContent_DataListHybridItems tr td span'
  }, {
    type:'magic',
    uri: "MagicItems.aspx?ItemName=All&Family=None",
    selector: "table#ctl00_MainContent_GridViewMagicItems tr",
    internal: '#ctl00_MainContent_DataListMagicItems tr td span'
  }, {
    type:'tech',
    uri: "TechItems.aspx?ItemName=All&Family=None",
    selector: "table#ctl00_MainContent_GridViewTechItems tr",
    internal: '#ctl00_MainContent_DataListTechItems tr td span'
  }].map(async def => {
    const l = await loadItemsOfType(def);
    l.forEach(x=>items.push(x));
  }));
  return items;
}

async function loadEquipment() {
  const armors = await loadArmors();
  const weaponsByType = await loadWeapons();
  const weapons = [];
  weaponsByType.forEach(weaponsOfType => {
    const weapon_type=weaponsOfType.type;
    weaponsOfType.weapons.forEach(weapon => {
      weapons.push(Object.assign({},weapon,{
        equipment_type: 'weapon',
        weapon_type,
      }));
    });
  });
  const ammunitions = await loadAmmunitions();
  const augmentations = await loadAugmentations();
  const items = await loadItems();
  return armors
    .concat(weapons)
    .concat(ammunitions)
    .concat(augmentations)
    .concat(items);
}

async function writeEquipmentToFile() {
	const objects = await loadEquipment();
	await writeObjectsToFile({objects,type:'equipment'});
}
ifRunningThis(__filename, writeEquipmentToFile);

module.exports = {writeEquipmentToFile};
