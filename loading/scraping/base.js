const request=require('request');
const fs=require('fs');
const path=require('path');
const cheerio=require('cheerio');
const debug=require('debug')('base.js');
const async=require('async');

const queue = async.queue((fn,cb) => fn(cb), 10);

let cacheSetup=false;
const cacheDirectory = path.join(__dirname,'/web_cache');
function setupCache(options,callback) {
	if(cacheSetup) return callback();
	fs.mkdir(cacheDirectory, e => {
		if(e && e.code != 'EEXIST') return callback(e);
		cacheSetup=true;
		callback();
	});
}

const levelStrings = [
	'none',
	'1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th',
	'11th','12th','13th','14th','15th','16th','17th','18th','19th','20th'
];

const methods = {
	getByItalics:function(node) {
		if(Array.isArray(node)) node = {children:node};
		const{children}=node;
		const def={};
		let name;
		children.forEach(x => {
			if(x.is_italics) {
				name = x.text.trim();
				if(def[name]) throw new Error("Didn't expect multiple: "+name);
				def[name] = [];
			} else if(name) {
				def[name].push(x);
			}
		});
		if(!name) throw new Error("No italics found");
		return def;
	},
	getByBold:function(node, allowEmpty,opts) {
		opts = opts || {
			end_line_break: false,
			ignore_header: false
		};

		if(Array.isArray(node)) node = {children:node};
		const{children}=node;
		const def={
			'_after': {}
		};
		let name,after;
		children.forEach(x => {
			if(x.header && opts.ignore_header) return;

			if(x.is_bold) {
				name = x.text.trim();
				if(def[name]) throw new Error("Didn't expect multiple: "+name);
				def[name] = [];
			} else if(name) {
				debug('pushing',x.text,'to',name);
				def[name].push(x);

				if(x.line_break && opts.end_line_break) {
					after=name;
					name = null;
					def._after[after]=[];
				}
			} else if(after) {
				def._after[after].push(x);
			}
		});

		if(!Object.keys(def._after).length) delete def._after;

		if(!Object.keys(def).length && !allowEmpty) throw new Error("No bold found");
		return def;
	},

	parseParenAwareList:function(str, separator) {
		if(str.children) str = str.children;
		if(Array.isArray(str)) {
			const strs = str.map(x=>x.text || x.toString());
			// console.log('processing',strs,'from',str);
			const full = strs.map(x=>this.parseParenAwareList(x,separator));
			const actual = [];
			full.forEach(x=>x.forEach(y=>actual.push(y)));
			return actual;
		}

		let list = [];
		let current = '', paren=0, ignore=0;
		[...str].forEach((c,i) => {
			if(ignore) {
				ignore --;
			} else if(paren) {
				if(c == ')') paren --;
				else if (c == '(') paren ++;
				current += c;
			} else if(c == separator[0] && str.slice(i,i+separator.length) == separator) {
				ignore = separator.length - 1;
				list.push(current);
				current = '';
			} else {
				if(c == '(') paren++;
				current += c;
			}
		});
		if(current) list.push(current);
		// console.log(str,'->');
		return list.map(x=>x.trim());
	},

	parseSemicolonList:function(str) {
		return this.parseParenAwareList(str,';');
	},

	parseCommaList:function(str) {
		let base = this.parseParenAwareList(str,",");
		if(!base.length) return base;

		let last = base.slice(-1)[0];
		if(last.indexOf("or ") == 0) last = last.slice(3);
		if(last.indexOf("and ") == 0) last = last.slice(4);

		base = base.slice(0,-1).concat(this.parseParenAwareList(last," or "));
		return base;
	},

	parseBold:function(node,rules, opts) {
		const parsed = this.getByBold(node,false,opts);
		const parts = Object.keys(parsed);

		if(typeof rules == 'function') {
			const p=rules;
			rules = {};
			parts.forEach(x=>rules[x]=p);
		}

		const missing = parts.filter(x=>!rules[x.replace(/\s/g,' ').trim()]);
		if(missing.length) throw new Error("No rules for: "+missing.join(','));

		const result = {};
		parts.filter(x=>x).forEach(key => {
			const ruleKey = key.replace(/\s/g,' ').trim();
			if(typeof rules[ruleKey] != 'function') {
				throw new Error(key +' invalid function found');
			}
			try{
				result[key] = rules[ruleKey](parsed[key],key)
			} catch(e) {
				console.error('failed on',key,parsed[key]);
				throw e;
			}
		});
		return result;
	},

	uri:function(baseUri,part) {
		if(part.indexOf('http:') == 0) return part;
		return `${baseUri}${part}`;
	},
	scrapeRequest:function(options,callback) {
		if(!callback) return new Promise((resolve,reject) => this.scrapeRequest(options,(e,r) => {
			if(e) {
				debug('error with:',options);
				return reject(e);
			}
			resolve(r);
		}));

		if(typeof options == 'string') options = {uri:options};

		let uriKey = options.uri;
		if(uriKey.indexOf(this.baseUri) == 0) uriKey = uriKey.slice(this.baseUri.length);
		options.uri = encodeURI(this.uri(this.baseUri, options.uri));
		setupCache({}, e => {
			if(e) return callback(e);
			const filename = uriKey.replace(/[^\w\d]/g,'_')+'.html';
			const check = path.join(cacheDirectory,filename);
			fs.readFile(check, {encoding:'utf8'}, (e,data) => {
				if(!e) return callback(null, data);
				// debug('loading',uriKey);
				queue.push(cb => {
					console.log("Querying:",options.uri);
					request(options, (e,r,c) => {
						if(e) return callback(e);
						debug('finished loaded');
						fs.writeFile(check, c, e => {
							if(e) return callback(e);
							setTimeout(cb);
							callback(null, c);
						});
					});
				});
			});
		});
	},
	buildHeaderBasedTree:function($, elements) {
		const array = [];
		elements.each((i,o) => {
			let el = $(o);
			const tag = el.get(0).tagName || 'text';
			const header = (tag.match(/h(\d+)/)||[])[1];
			let link = undefined;
			if(tag == 'a') link = el.attr('href');
			array.push({tag,el,header,link});
		});

		const root = {
			title:'top',
			children:[],
			header:0
		};
		const stack=[root];

		function getContent(element) {
			let [parent]=stack.slice(-1);
			const {el,header,link,tag} = element;
			const text = el.text().trim();
			if(!header) {
				if(text || link) parent.children.push({
					text,
					link,
					getEl: () => el,
					get$: () => $,
					is_bold: (tag == 'b') || undefined,
					is_italics: (tag == 'i') || undefined
				});
				if(tag == 'br') (parent.children.slice(-1)[0]||{}).line_break = true;
				return;
			}
			while(header <= parent.header) {
				stack.pop();
				parent = stack.slice(-1)[0];
			}
			const newBlock = {
				header,
				text,
				getEl: () => el,
				get$: () => $,
				children: []
			};
			parent.children.push(newBlock);
			stack.push(newBlock);
		}

		array.forEach(getContent);
		return stack[0];
	},
	getUntil:function(tree, endText) {
		if(Array.isArray(tree)) tree={children:tree};
		let end = tree.children.findIndex(x=>x.text.toLowerCase().trim() == endText);
		if(end == -1) {
			return [];
		}

		return tree.children.slice(0,end);
	},
	headerBasedTreeRequest:async function(o, selector) {
		const c = await this.scrapeRequest(o);
		let $=cheerio.load(c);
		const contents = $(selector).contents();
		if(!contents || !contents.length) throw new Error('No contents for '+selector);
		return this.buildHeaderBasedTree($,contents);
	},
	getBetween:function(tree,startText,endText) {
		const start = tree.children.findIndex(x=>x.text.toLowerCase().trim() == startText);
		let end = tree.children.findIndex(x=>x.text.toLowerCase().trim() == endText);
		if(start == -1) {
			debug('unable to find',startText);
			return [];
		}
		if(end == -1) end = tree.children.length;

		return tree.children.slice(start+1,end);
	},
	getPostText:function(tree,text) {
		text = text.toLowerCase().trim();
		const indexOf = tree.children.findIndex(x=>x.text.toLowerCase().trim() == text);
		if(indexOf == -1) {
			debug('Unable to find',text);
			return "";
		}
		return tree.children[indexOf+1].text;
	},
	getRest:function(tree,text) {
		text = text.toLowerCase().trim();
		const indexOf = tree.children.findIndex(x=>x.text.toLowerCase().trim() == text);
		if(indexOf == -1) {
			debug('Unable to find',text);
			return "";
		}
		return tree.children.slice(indexOf+1);
	},
	getTableRows:function({c,path,headerRow}) {
		if(headerRow == undefined) headerRow=0;
		// debug(c);
		let $=cheerio.load(c);
		const rows = $(path);
		if(!rows.length) {
			console.error(c);
			throw new Error('No rows');
		}
		let headers = rows.eq(headerRow).find('td,th')
			.map((i,th) => $(th).text().trim().toLowerCase()).toArray();

		if(!headers.length) throw new Error('No headers');
		debug(headers.length,'headers:',headers);
		const tableRows = rows.slice(headerRow+1).map((i,row) => {
			const values = $(row).find('td')
				.map((i,th) => {
					const text = $(th).text().trim().toLowerCase();
					let link = $(th).find('a').attr('href') || undefined;
					return {
						text, link
					};
				}).toArray();
			const parsed = {};
			headers.forEach((h,i) => parsed[h]=values[i]);
			return parsed;
		}).toArray();
		return tableRows;
	},
	parseTableBasedRequest:async function(uri,path,headerRow) {
		const c = await this.scrapeRequest(uri);
		return this.getTableRows({c,path,headerRow});
	},
	fullTransform:function(obj, map) {
		const sources = Object.keys(map).map(x=>map[x]);
		const missing = Object.keys(obj).filter(x=>!sources.find(y=>y==x));
		if(missing.length) throw new Error("Missing "+missing.join(','));
		const transformed = {};
		Object.keys(map).forEach(key => transformed[key] = obj[map[key]]);
		return transformed;
	},
	splitByLine:function(parsed) {
		if(Array.isArray(parsed)) parsed={children:parsed};
		const {children}=parsed;
		if(!children) throw new Error("Expected children");
		let lines = [[]];
		children.forEach(n => {
			lines[lines.length-1].push(n);
			if(n.line_break) lines.push([]);
		});
		if(!lines[lines.length-1].length) lines = lines.slice(0,-1);
		return lines;
	},
	getSingleValue:function(node) {
		if(typeof node == 'string') return node;
		if(node.children) node = node.children;
		if(!Array.isArray(node)) throw new Error('Expected array');
		if(node.length != 1) throw new Error('Expected single value in array');
		const value = node[0].text || node[0];
		if(typeof value != 'string') throw new Error('Expected string?');
		return value;
	},
	parseLevel:function(value) {
		if(!value) return value;
		if(parseInt(value) == value) return value;
		const index = levelStrings.findIndex(x=>x == value.toLowerCase());
		if(index == -1) return value;
		return index;
	},
	parseModifier:function(value) {
		if(!value) return value;
		value = value.toString().trim();
		const m = value.match(/[+|-]\s*(\d+)/);
		if(m) return m[1];
		return value;
	},

	clean: function(value) {
		return value.toLowerCase()
			.replace(/[^0-9a-z]+/g,' ').trim()
			.replace(/\s+/g,'_');
	},

	buildId:function(options, type) {
		const name = options.name || options;
		type = type || options.type;
		if(typeof name != 'string' || name.length < 2) throw new Error('Name must be longer than 2: ' + name);
		if(!type) throw new Error('Need type');

		const cleaned = this.clean(name);
		if(!cleaned) throw new Error('No id from: '+name);
		return type+'.'+cleaned;
	},
	writeObjectsToFile:function(options) {
		const{type,objects}=options;

		let ids={};

		if(!Array.isArray(objects)) throw new Error('Must be array');
		objects.forEach(x => x.id = x.id || this.buildId(x,type));

		objects.forEach(x => {
			if(ids[x.id]) throw new Error('Multiple objects with id: '+x.id);
			ids[x.id] = x;
		})

		fs.writeFileSync(path.join(__dirname,'../../objects/',type+'.json'), JSON.stringify(objects,null,2));
	},
	ifRunningThis:function(f, fn) {
		console.log(f,process.argv[1])
		if(process.argv[1] == f) return fn();
		else console.log('Nope');
	}

};

function build(context) {
	const baseUri = context.uri || 'http://aonsrd.com/';

	const object = {baseUri};
	Object.entries(methods).forEach(([method,fn]) => {
		if(object[method]) throw new Error('overriding set value');
		object[method] = function() {
			return fn.apply(object, arguments);
		};
	});
	return object;
}

const defaultBase = build({});
Object.entries(defaultBase).forEach(([k,v])=>build[k]=v);
module.exports = build;
