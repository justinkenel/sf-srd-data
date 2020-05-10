const cheerio=require('cheerio');
const {
	scrapeRequest,
	writeObjectsToFile, ifRunningThis
}=require('./base');
// const debug=require('debug')('feats.js');

async function listFeats() {
  const c = await scrapeRequest({
    uri: 'Feats.aspx'
  });
  let $=cheerio.load(c);
  const rows = $('#ctl00_MainContent_GridView6 tr').slice(1);
  if(!rows.length) throw new Error('no rows');
  const feats=[];
  rows.each((i,o) => {
    const el = $(o);
    const raw_name = el.find('td').eq(0).text().trim();
    const link = el.find('td a').eq(0).attr('href');
    const prerequisite_raw = el.find('td').eq(1).text().trim();
    const special_raw = el.find('td').eq(2).text().trim();

		const is_combat = (raw_name.slice(-1)[0] == '*');
		let name = raw_name;
		if(is_combat) name=name.slice(0,-1).trim();

    feats.push({
      raw_name,
			name,
			is_combat,
      link,
      prerequisite_raw,
      special_raw
    });
  });
  return feats;
}

function buildPrerequisites(text, feats) {
	if(text.length == 1) return [];

	const p = text.split(',');
	const skillRankMatch = /(.+)(\d+)\s+(?:rank|ranks)/;
	// const proficiencyMatch = /proficiency in (.+)/i;
	const keyAbilityScoreMatch = /key ability score (\d+)/i;
	const abilityScoreMatch = /(con|dex|str|cha|int|wis) (\d+)/i;
	const baseAttackBonusMatch = /base attack bonus \+(\d+)/i;

	return p.map(x => {
		x = x.trim();

		let match;
		// eslint-disable-next-line no-cond-assign
		if(match = x.match(skillRankMatch)) {
			const [skill,rank]=match.slice(1).map(x=>x.trim());
			return {
				type: 'skill_rank',
				skill,
				rank
			}; // eslint-disable-next-line no-cond-assign
		} else if(match = x.match(keyAbilityScoreMatch)) {
			const [score] = match.slice(1).map(x=>x.trim());
			return {
				type: 'key_ability_score',
				score
			}; // eslint-disable-next-line no-cond-assign
		} else if(match = x.match(abilityScoreMatch)) {
			const [ability,score]=match.slice(1).map(x=>x.trim());
			return {
				type: 'ability_score_match',
				ability,
				score
			}; // eslint-disable-next-line no-cond-assign
		} else if(match = x.match(baseAttackBonusMatch)) {
			const [bonus]=match.slice(1).map(x=>x.trim());
			return {
				type: 'base_attack_bonus',
				bonus
			}; // eslint-disable-next-line no-cond-assign
		} else if(match = feats.find(f => f.name == x)) {
			return {
				type: 'feat',
				name: match.name
			};
		}

		return {
			type: 'unknown',
			raw: x
		};
	});
}

async function loadFeats() {
  const feats = await listFeats();
	feats.forEach(feat => {
		feat.prerequisites = buildPrerequisites(feat.prerequisite_raw,feats);
	})
  return feats;
  // const fullDefinitions = await Promise.all(feats.map(loadFeat));
  // return fullDefinitions;
}

async function writeFeats() {
	const objects = await loadFeats();
	writeObjectsToFile({type:'feats', objects});
}

ifRunningThis(__filename, writeFeats);


module.exports={writeFeats};
