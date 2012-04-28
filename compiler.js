/*********************************** SETUP **********************************/

var PEG = require('pegjs');
var assert = require('assert');
var fs = require('fs'); // for loading files

/***************************** PERSER FUNCTIONS *****************************/

// Read file contents
var grammar = fs.readFileSync('mus.peg', 'utf-8');

// Create parser
var parse = PEG.buildParser(grammar).parse;

/**************************** COMPILER FUNCTIONS ****************************/

var endTime = function (time, expr) {
    switch (expr.tag) {
        case 'note':
        case 'rest': return time + expr.dur;
        case 'par': return Math.max(endTime(time, expr.left), endTime(time, expr.right));
        case 'seq': return (time = endTime(time, expr.left)) && endTime(time, expr.right);
        case 'repeat': return expr.count > 0 ? time + expr.count * (endTime(time, expr.section) - time) : 0;
    }
};

var getMidiPitch = function (note) {
	var l = note.length;
	
    if (!/^[a-g][#b]?[0-9]$/.test(note)) return 'error';
    return 12 + note.charAt(l - 1) * 12 + "c d ef g a b".indexOf(note.charAt(0).toLowerCase()) + (note.length == 3 ? (note.charAt(1) == '#' ? 1 : -1) : 0);
};

var compileExprNode = function (expr, time, notes) {
    var i, t;

    switch (expr.tag) {
        case 'note':
            notes.push({
                tag: 'note',
                pitch: getMidiPitch(expr.pitch),
                start: time,
                dur: expr.dur
            });
            break;

        case 'rest':
            break;
            
        case 'par':
            compileExprNode(expr.left, time, notes);
            compileExprNode(expr.right, time, notes);
            break;
            
        case 'seq':
            compileExprNode(expr.left, time, notes);
            time = endTime(time, expr.left);
            compileExprNode(expr.right, time, notes);
            break;
            
        case 'repeat':
            t = endTime(time, expr.section) - time;
            for (i = 0; i < expr.count; ++i) {
            	compileExprNode(expr.section, time, notes);
            	time += t;
            }
            break;
    }
};

var compile = function (expr) {
    var notes = [];
    
    compileExprNode(expr, 0, notes);
    return notes;
};

/*********************************** TESTS **********************************/

var parseAndCompile = function (expr) {
	return compile(parse(expr));
};

// Assumed: tempo = 120, octave = 4, duration = 500

// Notes
assert.deepEqual(parse('a3:125', 'note'), { tag: 'note', pitch: 'a3', dur: 125 });
assert.deepEqual(parse('b:250', 'note'), { tag: 'note', pitch: 'b4', dur: 250 });
assert.deepEqual(parse('c/16', 'note'), { tag: 'note', pitch: 'c4', dur: 125 });
assert.deepEqual(parse('d', 'note'), { tag: 'note', pitch: 'd4', dur: 500 });

// Rests
assert.deepEqual(parse('r:125', 'rest'), { tag: 'rest', dur: 125 });
assert.deepEqual(parse('r/2', 'rest'), { tag: 'rest', dur: 1000 });
assert.deepEqual(parse('r', 'rest'), { tag: 'rest', dur: 500 });

// Sequence
assert.deepEqual(parse('(e6:2000)', 'sequence'), { tag: 'note', pitch: 'e6', dur: 2000 });
assert.deepEqual(parse('(d1:125 g2:250)', 'sequence'), { tag: 'seq', left: { tag: 'note', pitch: 'd1', dur: 125 }, right: { tag: 'note', pitch: 'g2', dur: 250 } });
assert.deepEqual(parse('(a1:100 b2:200 c3:400)', 'sequence'), { tag: 'seq', left: { tag: 'note', pitch: 'a1', dur: 100 }, right: { tag: 'seq', left: { tag: 'note', pitch: 'b2', dur: 200 }, right: { tag: 'note', pitch: 'c3', dur: 400 } } });

// Parallel
assert.deepEqual(parse('[e6:2000]', 'parallel'), { tag: 'note', pitch: 'e6', dur: 2000 });
assert.deepEqual(parse('[d1:125 g2:250]', 'parallel'), { tag: 'par', left: { tag: 'note', pitch: 'd1', dur: 125 }, right: { tag: 'note', pitch: 'g2', dur: 250 } });
assert.deepEqual(parse('[a1:100 b2:200 c3:400]', 'parallel'), { tag: 'par', left: { tag: 'note', pitch: 'a1', dur: 100 }, right: { tag: 'par', left: { tag: 'note', pitch: 'b2', dur: 200 }, right: { tag: 'note', pitch: 'c3', dur: 400 } } });

// Repeat
assert.deepEqual(parse('11 * a3:125', 'repeat'), { tag: 'repeat', count: 11, section: { tag: 'note', pitch: 'a3', dur: 125 } });
assert.deepEqual(parse('22 * r:125', 'repeat'), { tag: 'repeat', count: 22, section: { tag: 'rest', dur: 125 } });
assert.deepEqual(parse('33 * (d1:125 g2:250)', 'repeat'), { tag: 'repeat', count: 33, section: { tag: 'seq', left: { tag: 'note', pitch: 'd1', dur: 125 }, right: { tag: 'note', pitch: 'g2', dur: 250 } } });
assert.deepEqual(parse('44 * [d1:125 g2:250]', 'repeat'), { tag: 'repeat', count: 44, section: { tag: 'par', left: { tag: 'note', pitch: 'd1', dur: 125 }, right: { tag: 'note', pitch: 'g2', dur: 250 } } });

// Settings
assert.deepEqual(parse('@octave = 3\n@tempo=60\na/4 b/2'), { tag: 'seq', left: { tag: 'note', pitch: 'a3', dur: 1000 }, right: { tag: 'note', pitch: 'b3', dur: 2000 } });
assert.deepEqual(parse('@octave = 7\n@tempo=75\na/4 b/2'), { tag: 'seq', left: { tag: 'note', pitch: 'a7', dur: 800 }, right: { tag: 'note', pitch: 'b7', dur: 1600 } });
assert.deepEqual(parse('@duration = 333\na b'), { tag: 'seq', left: { tag: 'note', pitch: 'a4', dur: 333 }, right: { tag: 'note', pitch: 'b4', dur: 333 } });

// Complex piece

var piece = '@octave = 4\n@tempo = 60\nc4/4 c 2*g 2*a g/2 f/4 f 2*e 2*d c/2 2*(g/4 g 2*f 2*e d/2) c/4 c 2*g 2*a g/2 f/4 f 2*e 2*d c/2';
var compiled = [
	{ tag: 'note', pitch: 60, start: 0, dur: 1000 },
	{ tag: 'note', pitch: 60, start: 1000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 2000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 3000, dur: 1000 },
	{ tag: 'note', pitch: 69, start: 4000, dur: 1000 },
	{ tag: 'note', pitch: 69, start: 5000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 6000, dur: 2000 },
	{ tag: 'note', pitch: 65, start: 8000, dur: 1000 },
	{ tag: 'note', pitch: 65, start: 9000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 10000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 11000, dur: 1000 },
	{ tag: 'note', pitch: 62, start: 12000, dur: 1000 },
	{ tag: 'note', pitch: 62, start: 13000, dur: 1000 },
	{ tag: 'note', pitch: 60, start: 14000, dur: 2000 },
	{ tag: 'note', pitch: 67, start: 16000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 17000, dur: 1000 },
	{ tag: 'note', pitch: 65, start: 18000, dur: 1000 },
	{ tag: 'note', pitch: 65, start: 19000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 20000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 21000, dur: 1000 },
	{ tag: 'note', pitch: 62, start: 22000, dur: 2000 },
	{ tag: 'note', pitch: 67, start: 24000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 25000, dur: 1000 },
	{ tag: 'note', pitch: 65, start: 26000, dur: 1000 },
	{ tag: 'note', pitch: 65, start: 27000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 28000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 29000, dur: 1000 },
	{ tag: 'note', pitch: 62, start: 30000, dur: 2000 },
	{ tag: 'note', pitch: 60, start: 32000, dur: 1000 },
	{ tag: 'note', pitch: 60, start: 33000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 34000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 35000, dur: 1000 },
	{ tag: 'note', pitch: 69, start: 36000, dur: 1000 },
	{ tag: 'note', pitch: 69, start: 37000, dur: 1000 },
	{ tag: 'note', pitch: 67, start: 38000, dur: 2000 },
	{ tag: 'note', pitch: 65, start: 40000, dur: 1000 },
	{ tag: 'note', pitch: 65, start: 41000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 42000, dur: 1000 },
	{ tag: 'note', pitch: 64, start: 43000, dur: 1000 },
	{ tag: 'note', pitch: 62, start: 44000, dur: 1000 },
	{ tag: 'note', pitch: 62, start: 45000, dur: 1000 },
	{ tag: 'note', pitch: 60, start: 46000, dur: 2000 }
];

assert.deepEqual(parseAndCompile(piece), compiled);