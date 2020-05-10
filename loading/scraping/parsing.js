const debug=require('debug')('parsing.js');

const resistances = (arr) => {
  if(typeof nodes == 'string') arr = [arr];

  const str = arr.map(x=>x.text || x.toString()).join(' ');
  return str.split(',')
    .map(x=>x.trim())
    .filter(x=>x)
    .map(x=> {
      const match = x.match(/^(.+)\s+(\d+);?$/);
      if(!match) {
        debug(arr);
        throw new Error("Unexpected resistance format: "+x);
      }
      const[type,value]=match.slice(1);
      return {type,value};
    });
}

const speeds = (arr) => {
  if(typeof nodes == 'string') arr = [arr];
  const str = arr.map(x=>x.text || x.toString()).join(' ');
  return str.split(',')
    .map(x=>x.trim())
    .filter(x=>x)
    .map(x=>{
      if(x.match(/^(\d+)\s+ft\./)) {
        return {
          type:'default',
          value: x.split(' ')[0].trim()
        };
      }

      const match = x.match(/^(.+)\s+(\d+)\s+ft\.$/);
      if(!match) {
        debug(arr);
        throw new Error("Unexpected speed format: "+x);
      }
      const[type,value]=match.slice(1);
      return {type,value};
    });
}

module.exports = {
  resistances,
  speeds
};
