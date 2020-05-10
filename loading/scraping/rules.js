const {headerBasedTreeRequest,
  ifRunningThis,writeObjectsToFile,
  clean
}=require('./base');

async function getRuleLinks() {
  const rulesTree = await headerBasedTreeRequest('/Rules.aspx', '#ctl00_MainContent_DetailedOutput');
  const {children}=rulesTree;
  const headers = children.filter(x=>x.header == 1);

  const core = headers.find(x => x.text.indexOf('Starfinder Core Rulebook') == 0);

  const [node] = core.children;

  const el = node.getEl();
  const links = el.find('a');
  const $ = node.get$();

  const parsed = [];
  links.each((i,a) => {
    const label = $(a).text();
    const href = $(a).attr('href');
    parsed.push({label,href});
  });

  // console.log(parsed);
  // console.log('links:',links.length);
  const actionsInCombatLink = parsed.find(x=>x.label == 'Actions in Combat');
  if(!actionsInCombatLink) throw new Error('failed to find "Actions in Combat"');

  // const actionsInCombat = getActionsInCombat(actionsInCombatLink);

  return {actionsInCombatLink};
}

async function getActionsInCombat() {
  const {actionsInCombatLink:{href}}=await getRuleLinks();

  const fullRules = await headerBasedTreeRequest(href, '#ctl00_MainContent_DetailedOutput');

  const actions = [];

  // const byLabel = {};
  fullRules.children.forEach(x => {
    const typeKey = clean(x.text);
    const type = x.text;
    (x.children||[]).filter(y=>(y.children||[].length)).forEach(y => {
      const action = y.text;
      const description = (y.children||[]).map(z=>z.text);
      actions.push({
        id: clean(`${type}.${action}`),
        name: action,
        type,
        typeKey,
        description
      });
    });
  });

  return actions;
}

async function writeRulesToFile() {
	const objects = await getActionsInCombat();
  console.log(JSON.stringify(objects,null,2));
	await writeObjectsToFile({objects,type:'combat_actions'});
}
ifRunningThis(__filename, writeRulesToFile);

module.exports = {writeRulesToFile};
