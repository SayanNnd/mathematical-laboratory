/**
 * TANGENT LINE TRACER & DERIVATIVE CASCADE
 * Math Lab / 31-derivates
 *
 * An interactive calculus instrument featuring:
 * 1. Robust mathematical expression parser with AST compilation and symbolic differentiation.
 * 2. High-precision numerical differentiation fallback with 5-point central stencils.
 * 3. Multi-tier recursive derivative cascade (up to 6 tiers: f -> f' -> f'' -> f''' -> f⁽⁴⁾ -> f⁽⁵⁾).
 * 4. Geometric tangent line tracer with slope-to-height vertical projection.
 * 5. Full 2D isotropic 1:1 pan & zoom (Desmos-like).
 * 6. Dynamic differential slope triangle (revealed on close zoom).
 * 7. Synchronized probe focus tracking across derivative tiers.
 */

// ============================================================================
// 1. MATHEMATICAL PARSER, AST & DIFFERENTIATOR
// ============================================================================

class MathEngine {
    static tokenize(str) {
        str = str.replace(/\s+/g, '');
        str = str.replace(/²/g, '^2').replace(/³/g, '^3');
        str = str.replace(/π/g, 'pi');
        str = str.replace(/ln\(/g, 'log(');

        const tokens = [];
        let i = 0;
        while (i < str.length) {
            const ch = str[i];

            // Numbers
            if (/\d/.test(ch) || (ch === '.' && /\d/.test(str[i + 1] || ''))) {
                let numStr = '';
                while (i < str.length && (/\d/.test(str[i]) || str[i] === '.')) {
                    numStr += str[i];
                    i++;
                }
                tokens.push({ type: 'num', value: parseFloat(numStr) });
                continue;
            }

            // Identifiers: variables, constants, functions
            if (/[a-zA-Z]/.test(ch)) {
                let idStr = '';
                while (i < str.length && /[a-zA-Z0-9_]/.test(str[i])) {
                    idStr += str[i];
                    i++;
                }
                tokens.push({ type: 'id', value: idStr.toLowerCase() });
                continue;
            }

            // Operators & Parens
            if ('+-*/^%()'.includes(ch)) {
                tokens.push({ type: 'op', value: ch });
                i++;
                continue;
            }

            // Skip unknown chars
            i++;
        }

        // Implicit multiplication expansion (e.g. 2x, 3sin(x), (x-1)(x+1), x sin(x))
        const expanded = [];
        for (let k = 0; k < tokens.length; k++) {
            const curr = tokens[k];
            const next = tokens[k + 1];
            expanded.push(curr);
            if (!next) break;

            const isCurrNum = curr.type === 'num';
            const isCurrVar = curr.type === 'id' && (curr.value === 'x' || curr.value === 'pi' || curr.value === 'e');
            const isCurrCloseParen = curr.type === 'op' && curr.value === ')';

            const isNextNum = next.type === 'num';
            const isNextId = next.type === 'id';
            const isNextOpenParen = next.type === 'op' && next.value === '(';

            if (
                (isCurrNum && (isNextId || isNextOpenParen)) ||
                (isCurrVar && (isNextId || isNextOpenParen || isNextNum)) ||
                (isCurrCloseParen && (isNextOpenParen || isNextNum || isNextId))
            ) {
                expanded.push({ type: 'op', value: '*' });
            }
        }
        return expanded;
    }

    static parse(str) {
        const tokens = this.tokenize(str);
        if (tokens.length === 0) throw new Error('Empty expression');
        let pos = 0;

        function peek() {
            return tokens[pos];
        }

        function consume(expected) {
            const token = tokens[pos];
            if (!token) throw new Error('Unexpected end of formula');
            if (expected && (token.type !== expected.type || token.value !== expected.value)) {
                throw new Error(`Expected '${expected.value}' but found '${token.value}'`);
            }
            pos++;
            return token;
        }

        function parseExpr() {
            let left = parseTerm();
            while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
                const op = consume().value;
                const right = parseTerm();
                left = { type: 'binary', op, left, right };
            }
            return left;
        }

        function parseTerm() {
            let left = parseUnary();
            while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
                const op = consume().value;
                const right = parseUnary();
                left = { type: 'binary', op, left, right };
            }
            return left;
        }

        function parseUnary() {
            if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
                const op = consume().value;
                const arg = parseUnary();
                if (op === '+') return arg;
                return { type: 'unary', op: '-', arg };
            }
            return parseFactor();
        }

        function parseFactor() {
            let left = parsePrimary();
            if (peek() && peek().type === 'op' && peek().value === '^') {
                const op = consume().value;
                const right = parseUnary();
                left = { type: 'binary', op, left, right };
            }
            return left;
        }

        function parsePrimary() {
            const token = peek();
            if (!token) throw new Error('Unexpected end of expression');

            if (token.type === 'num') {
                consume();
                return { type: 'num', value: token.value };
            }

            if (token.type === 'op' && token.value === '(') {
                consume();
                const expr = parseExpr();
                consume({ type: 'op', value: ')' });
                return expr;
            }

            if (token.type === 'id') {
                const id = consume().value;
                if (id === 'x') return { type: 'var', name: 'x' };
                if (id === 'pi') return { type: 'num', value: Math.PI };
                if (id === 'e') return { type: 'num', value: Math.E };

                if (peek() && peek().type === 'op' && peek().value === '(') {
                    consume();
                    const arg = parseExpr();
                    consume({ type: 'op', value: ')' });
                    return { type: 'call', fn: id, arg };
                }
                return { type: 'var', name: id };
            }

            throw new Error(`Unexpected token '${token.value}'`);
        }

        const ast = parseExpr();
        if (pos < tokens.length) {
            throw new Error(`Unexpected symbol '${tokens[pos].value}'`);
        }
        return ast;
    }

    static evaluate(ast, x) {
        if (!ast) return NaN;
        switch (ast.type) {
            case 'num': return ast.value;
            case 'var': return x;
            case 'unary': return -this.evaluate(ast.arg, x);
            case 'binary': {
                const left = this.evaluate(ast.left, x);
                const right = this.evaluate(ast.right, x);
                switch (ast.op) {
                    case '+': return left + right;
                    case '-': return left - right;
                    case '*': return left * right;
                    case '/': return Math.abs(right) < 1e-15 ? (left >= 0 ? Infinity : -Infinity) : left / right;
                    case '%': return left % right;
                    case '^': return Math.pow(left, right);
                }
                return NaN;
            }
            case 'call': {
                const arg = this.evaluate(ast.arg, x);
                switch (ast.fn) {
                    case 'sin': return Math.sin(arg);
                    case 'cos': return Math.cos(arg);
                    case 'tan': return Math.tan(arg);
                    case 'asin': return Math.asin(arg);
                    case 'acos': return Math.acos(arg);
                    case 'atan': return Math.atan(arg);
                    case 'sinh': return Math.sinh(arg);
                    case 'cosh': return Math.cosh(arg);
                    case 'tanh': return Math.tanh(arg);
                    case 'exp': return Math.exp(arg);
                    case 'log': case 'ln': return Math.log(arg);
                    case 'log10': return Math.log10(arg);
                    case 'sqrt': return Math.sqrt(arg);
                    case 'cbrt': return Math.cbrt(arg);
                    case 'abs': return Math.abs(arg);
                    case 'sign': return Math.sign(arg);
                    case 'floor': return Math.floor(arg);
                    case 'ceil': return Math.ceil(arg);
                    case 'round': return Math.round(arg);
                }
                return NaN;
            }
        }
        return NaN;
    }

    static diff(ast) {
        if (!ast) return { type: 'num', value: 0 };
        switch (ast.type) {
            case 'num':
                return { type: 'num', value: 0 };
            case 'var':
                return ast.name === 'x' ? { type: 'num', value: 1 } : { type: 'num', value: 0 };
            case 'unary':
                return this.simplify({ type: 'unary', op: '-', arg: this.diff(ast.arg) });
            case 'binary': {
                const u = ast.left;
                const v = ast.right;
                const du = this.diff(u);
                const dv = this.diff(v);

                switch (ast.op) {
                    case '+':
                        return this.simplify({ type: 'binary', op: '+', left: du, right: dv });
                    case '-':
                        return this.simplify({ type: 'binary', op: '-', left: du, right: dv });
                    case '*':
                        return this.simplify({
                            type: 'binary', op: '+',
                            left: { type: 'binary', op: '*', left: du, right: v },
                            right: { type: 'binary', op: '*', left: u, right: dv }
                        });
                    case '/':
                        return this.simplify({
                            type: 'binary', op: '/',
                            left: {
                                type: 'binary', op: '-',
                                left: { type: 'binary', op: '*', left: du, right: v },
                                right: { type: 'binary', op: '*', left: u, right: dv }
                            },
                            right: { type: 'binary', op: '^', left: v, right: { type: 'num', value: 2 } }
                        });
                    case '^':
                        if (v.type === 'num') {
                            const c = v.value;
                            if (c === 0) return { type: 'num', value: 0 };
                            if (c === 1) return du;
                            return this.simplify({
                                type: 'binary', op: '*',
                                left: {
                                    type: 'binary', op: '*',
                                    left: { type: 'num', value: c },
                                    right: { type: 'binary', op: '^', left: u, right: { type: 'num', value: c - 1 } }
                                },
                                right: du
                            });
                        }
                        if (u.type === 'num' && u.value > 0) {
                            return this.simplify({
                                type: 'binary', op: '*',
                                left: {
                                    type: 'binary', op: '*',
                                    left: ast,
                                    right: { type: 'num', value: Math.log(u.value) }
                                },
                                right: dv
                            });
                        }
                        return this.simplify({
                            type: 'binary', op: '*',
                            left: ast,
                            right: {
                                type: 'binary', op: '+',
                                left: { type: 'binary', op: '*', left: dv, right: { type: 'call', fn: 'log', arg: u } },
                                right: { type: 'binary', op: '/', left: { type: 'binary', op: '*', left: v, right: du }, right: u }
                            }
                        });
                }
                return { type: 'num', value: 0 };
            }
            case 'call': {
                const u = ast.arg;
                const du = this.diff(u);
                switch (ast.fn) {
                    case 'sin':
                        return this.simplify({ type: 'binary', op: '*', left: { type: 'call', fn: 'cos', arg: u }, right: du });
                    case 'cos':
                        return this.simplify({
                            type: 'binary', op: '*',
                            left: { type: 'unary', op: '-', arg: { type: 'call', fn: 'sin', arg: u } },
                            right: du
                        });
                    case 'tan':
                        return this.simplify({
                            type: 'binary', op: '/',
                            left: du,
                            right: { type: 'binary', op: '^', left: { type: 'call', fn: 'cos', arg: u }, right: { type: 'num', value: 2 } }
                        });
                    case 'exp':
                        return this.simplify({ type: 'binary', op: '*', left: ast, right: du });
                    case 'log': case 'ln':
                        return this.simplify({ type: 'binary', op: '/', left: du, right: u });
                    case 'sqrt':
                        return this.simplify({
                            type: 'binary', op: '/',
                            left: du,
                            right: { type: 'binary', op: '*', left: { type: 'num', value: 2 }, right: { type: 'call', fn: 'sqrt', arg: u } }
                        });
                    case 'sinh':
                        return this.simplify({ type: 'binary', op: '*', left: { type: 'call', fn: 'cosh', arg: u }, right: du });
                    case 'cosh':
                        return this.simplify({ type: 'binary', op: '*', left: { type: 'call', fn: 'sinh', arg: u }, right: du });
                    case 'tanh':
                        return this.simplify({
                            type: 'binary', op: '/',
                            left: du,
                            right: { type: 'binary', op: '^', left: { type: 'call', fn: 'cosh', arg: u }, right: { type: 'num', value: 2 } }
                        });
                    case 'atan':
                        return this.simplify({
                            type: 'binary', op: '/',
                            left: du,
                            right: { type: 'binary', op: '+', left: { type: 'num', value: 1 }, right: { type: 'binary', op: '^', left: u, right: { type: 'num', value: 2 } } }
                        });
                }
                return { type: 'num', value: 0 };
            }
        }
        return { type: 'num', value: 0 };
    }

    static simplify(ast) {
        if (!ast) return ast;
        if (ast.type === 'binary') {
            const left = this.simplify(ast.left);
            const right = this.simplify(ast.right);

            if (left.type === 'num' && right.type === 'num') {
                const val = this.evaluate({ type: 'binary', op: ast.op, left, right }, 0);
                if (Number.isFinite(val)) {
                    return { type: 'num', value: Math.round(val * 1e8) / 1e8 };
                }
            }

            if (ast.op === '+') {
                if (left.type === 'num' && left.value === 0) return right;
                if (right.type === 'num' && right.value === 0) return left;
                if (right.type === 'unary' && right.op === '-') return this.simplify({ type: 'binary', op: '-', left, right: right.arg });
            }
            if (ast.op === '-') {
                if (right.type === 'num' && right.value === 0) return left;
                if (left.type === 'num' && left.value === 0) return this.simplify({ type: 'unary', op: '-', arg: right });
                if (right.type === 'unary' && right.op === '-') return this.simplify({ type: 'binary', op: '+', left, right: right.arg });
            }
            if (ast.op === '*') {
                if ((left.type === 'num' && left.value === 0) || (right.type === 'num' && right.value === 0)) return { type: 'num', value: 0 };
                if (left.type === 'num' && left.value === 1) return right;
                if (right.type === 'num' && right.value === 1) return left;
                if (left.type === 'num' && left.value === -1) return this.simplify({ type: 'unary', op: '-', arg: right });
                if (right.type === 'num' && right.value === -1) return this.simplify({ type: 'unary', op: '-', arg: left });
            }
            if (ast.op === '/') {
                if (left.type === 'num' && left.value === 0) return { type: 'num', value: 0 };
                if (right.type === 'num' && right.value === 1) return left;
            }
            if (ast.op === '^') {
                if (right.type === 'num' && right.value === 0) return { type: 'num', value: 1 };
                if (right.type === 'num' && right.value === 1) return left;
                if (left.type === 'num' && left.value === 1) return { type: 'num', value: 1 };
                if (left.type === 'num' && left.value === 0) return { type: 'num', value: 0 };
            }
            return { type: 'binary', op: ast.op, left, right };
        }
        if (ast.type === 'unary' && ast.op === '-') {
            const arg = this.simplify(ast.arg);
            if (arg.type === 'num') return { type: 'num', value: -arg.value };
            if (arg.type === 'unary' && arg.op === '-') return arg.arg;
            return { type: 'unary', op: '-', arg };
        }
        return ast;
    }

    static format(ast) {
        if (!ast) return '';
        switch (ast.type) {
            case 'num':
                return Number.isInteger(ast.value) ? String(ast.value) : ast.value.toFixed(2);
            case 'var':
                return ast.name;
            case 'unary':
                return `-${this.format(ast.arg)}`;
            case 'binary': {
                const l = this.format(ast.left);
                const r = this.format(ast.right);
                if (ast.op === '^') return `${l}^${r}`;
                if (ast.op === '*') return `${l}·${r}`;
                return `${l} ${ast.op} ${r}`;
            }
            case 'call':
                return `${ast.fn}(${this.format(ast.arg)})`;
        }
        return '';
    }

    static numDiff(fn, x, order = 1) {
        if (order === 0) return fn(x);
        const scale = Math.max(1.0, Math.abs(x));

        if (order === 1) {
            const h = 1e-4 * scale;
            return (-fn(x + 2 * h) + 8 * fn(x + h) - 8 * fn(x - h) + fn(x - 2 * h)) / (12 * h);
        }
        if (order === 2) {
            const h = 1e-3 * scale;
            return (-fn(x + 2 * h) + 16 * fn(x + h) - 30 * fn(x) + 16 * fn(x - h) - fn(x - 2 * h)) / (12 * h * h);
        }
        if (order === 3) {
            const h = 5e-3 * scale;
            return (-fn(x + 3 * h) + 8 * fn(x + 2 * h) - 13 * fn(x + h) + 13 * fn(x - h) - 8 * fn(x - 2 * h) + fn(x - 3 * h)) / (8 * h * h * h);
        }
        if (order === 4) {
            const h = 1e-2 * scale;
            return (fn(x + 2 * h) - 4 * fn(x + h) + 6 * fn(x) - 4 * fn(x - h) + fn(x - 2 * h)) / (h * h * h * h);
        }

        const h = 2e-2 * scale;
        const d_prev = (val) => this.numDiff(fn, val, order - 1);
        return (d_prev(x + h) - d_prev(x - h)) / (2 * h);
    }
}

// ============================================================================
// 2. DOM ELEMENTS & STATE CONFIGURATION
// ============================================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWrap = document.getElementById("canvasWrap");

// Stats & badges
const statTiers = document.getElementById("statTiers");
const statX = document.getElementById("statX");
const statSlope = document.getElementById("statSlope");
const drawStatusText = document.getElementById("drawStatusText");

// Equation inputs
const fnInput = document.getElementById("fnInput");
const inputStatus = document.getElementById("inputStatus");
const fnMsg = document.getElementById("fnMsg");
const presetButtons = document.querySelectorAll(".preset-btn");

// Tiers
const tierChipsContainer = document.getElementById("tierChips");
const tierCountLabel = document.getElementById("tierCountLabel");
const addTierBtn = document.getElementById("addTierBtn");
const removeTierBtn = document.getElementById("removeTierBtn");

// Drawing modes
const modeLive = document.getElementById("modeLive");
const modeFull = document.getElementById("modeFull");
const drawFullBtn = document.getElementById("drawFullBtn");
const clearTraceBtn = document.getElementById("clearTraceBtn");

// Scrubber & animation
const probeInput = document.getElementById("probeInput");
const probeLabel = document.getElementById("probeLabel");
const playBtn = document.getElementById("playBtn");

// Toggles & View
const toggleTangent = document.getElementById("toggleTangent");
const toggleGuide = document.getElementById("toggleGuide");
const resetZoomBtn = document.getElementById("resetZoomBtn");

// Live readouts
const readoutA = document.getElementById("readoutA");
const readoutF = document.getElementById("readoutF");
const readoutF1 = document.getElementById("readoutF1");
const readoutTanEq = document.getElementById("readoutTanEq");
const readoutF2 = document.getElementById("readoutF2");
const readoutF3 = document.getElementById("readoutF3");
const readoutF4 = document.getElementById("readoutF4");
const readoutF5 = document.getElementById("readoutF5");
const rowReadoutF2 = document.getElementById("rowReadoutF2");
const rowReadoutF3 = document.getElementById("rowReadoutF3");
const rowReadoutF4 = document.getElementById("rowReadoutF4");
const rowReadoutF5 = document.getElementById("rowReadoutF5");

// Tier metadata definitions
const TIER_META = [
    { order: 0, label: "f(x)", title: "PRIMARY FUNCTION", color: "#35e0d0" },
    { order: 1, label: "f'(x)", title: "1ST DERIVATIVE", color: "#ff6b9d" },
    { order: 2, label: "f''(x)", title: "2ND DERIVATIVE", color: "#f4d35e" },
    { order: 3, label: "f'''(x)", title: "3RD DERIVATIVE", color: "#4d91ff" },
    { order: 4, label: "f⁽⁴⁾(x)", title: "4TH DERIVATIVE", color: "#ff8c42" },
    { order: 5, label: "f⁽⁵⁾(x)", title: "5TH DERIVATIVE", color: "#c084fc" },
    { order: 6, label: "f⁽⁶⁾(x)", title: "6TH DERIVATIVE", color: "#34d399" }
];

// App State
const state = {
    // Math
    rawFn: "sin(3*x) / (1 + 0.2*x^2)",
    ast: null,
    fnEvaluator: (x) => Math.sin(3 * x) / (1 + 0.2 * x * x),
    tierAsts: [],

    // Cascade Tiers
    tierCount: 2,

    // Default 10x10 Domain on both axes (1:1 isotropic)
    xMin: -10.0,
    xMax:  10.0,
    paneYBounds: Array.from({ length: 7 }, () => ({ yMin: -10.0, yMax: 10.0 })),

    // Probe
    probeA: 1.0,
    prevProbeA: 1.0,

    // Drawing modes: 'live' | 'full'
    drawMode: 'live',

    // Tracing coverage (for 'live' mode): list of [start, end] intervals
    tracedIntervals: [[-10.0, 1.0]],

    // Animation sweep
    animating: false,
    animSpeed: 1.0,
    animDirection: 1,
    lastFrameTime: performance.now(),

    // Display options
    showTangent: true,
    showGuide: true,

    // Canvas sizing
    width: 900,
    height: 720,
    dpr: window.devicePixelRatio || 1,

    // Interaction
    isDragging: false,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panInitMinX: -10.0,
    panInitMaxX:  10.0,
    panInitPaneYBounds: [],

    // Edge-pan (auto-scroll when probe is dragged near canvas edge)
    edgePanRAF: null,       // rAF handle
    edgePanVelocity: 0,    // math-units per second; negative = left, positive = right
};


// ============================================================================
// 3. EQUATION COMPILER & EVALUATION
// ============================================================================

function compileEquation(exprStr) {
    try {
        const ast = MathEngine.parse(exprStr);
        const testY = MathEngine.evaluate(ast, 0);
        if (Number.isNaN(testY) && Number.isNaN(MathEngine.evaluate(ast, 1))) {
            throw new Error("Formula yielded NaN for test values");
        }

        state.rawFn = exprStr;
        state.ast = ast;
        state.fnEvaluator = (x) => MathEngine.evaluate(ast, x);

        // Precompute symbolic ASTs for up to 6 tiers
        state.tierAsts = [ast];
        let currAst = ast;
        for (let i = 1; i <= 6; i++) {
            try {
                currAst = MathEngine.diff(currAst);
                state.tierAsts.push(currAst);
            } catch (e) {
                state.tierAsts.push(null);
            }
        }

        if (inputStatus) {
            inputStatus.className = "input-status-indicator valid";
            inputStatus.title = "Formula valid";
        }
        if (fnMsg) {
            fnMsg.textContent = `parsed: f(x) = ${MathEngine.format(ast)}`;
            fnMsg.style.color = "var(--muted)";
        }

        invalidateCurveCache();
        render();
    } catch (err) {
        if (inputStatus) {
            inputStatus.className = "input-status-indicator invalid";
            inputStatus.title = `Syntax error: ${err.message}`;
        }
        if (fnMsg) {
            fnMsg.textContent = `error: ${err.message}`;
            fnMsg.style.color = "var(--pink)";
        }
    }
}

/**
 * Fast evaluation of tier k at x
 */
function evalTier(k, x) {
    if (k === 0) {
        try {
            return state.fnEvaluator(x);
        } catch (_) {
            return NaN;
        }
    }

    // Symbolic AST evaluation
    if (state.tierAsts && state.tierAsts[k]) {
        try {
            const val = MathEngine.evaluate(state.tierAsts[k], x);
            if (Number.isFinite(val)) return val;
        } catch (_) {}
    }

    // Numerical stencil fallback
    return MathEngine.numDiff(state.fnEvaluator, x, k);
}

// ============================================================================
// PERFORMANCE OPTIMIZATION: CURVE SAMPLING CACHE
// ============================================================================
const tierCurveCache = new Map();

function invalidateCurveCache() {
    tierCurveCache.clear();
}

function getTierCurveSamples(tierIdx, steps, xMin, xMax) {
    const xMinKey = xMin.toFixed(6);
    const xMaxKey = xMax.toFixed(6);
    const key = `${tierIdx}_${steps}_${xMinKey}_${xMaxKey}_${state.eqRaw}`;

    if (tierCurveCache.has(key)) {
        return tierCurveCache.get(key);
    }

    const samples = new Float64Array(steps + 1);
    const dx = (xMax - xMin) / steps;
    for (let i = 0; i <= steps; i++) {
        const x = xMin + i * dx;
        samples[i] = evalTier(tierIdx, x);
    }

    if (tierCurveCache.size > 80) {
        tierCurveCache.clear();
    }
    tierCurveCache.set(key, samples);
    return samples;
}


// ============================================================================
// 4. TRACING & COVERAGE INTERVAL TRACKING
// ============================================================================

function recordTraceCoverage(a0, a1) {
    const min = Math.min(a0, a1);
    const max = Math.max(a0, a1);

    const merged = [];
    let newInt = [min, max];

    for (const [s, e] of state.tracedIntervals) {
        if (newInt[1] < s - 0.05) {
            merged.push(newInt);
            newInt = [s, e];
        } else if (newInt[0] > e + 0.05) {
            merged.push([s, e]);
        } else {
            newInt = [Math.min(newInt[0], s), Math.max(newInt[1], e)];
        }
    }
    merged.push(newInt);
    state.tracedIntervals = merged;
}

function isPointTraced(x) {
    if (state.drawMode === 'full') return true;
    for (const [s, e] of state.tracedIntervals) {
        if (x >= s - 1e-4 && x <= e + 1e-4) return true;
    }
    return false;
}

function resetTrace() {
    state.tracedIntervals = [[state.probeA, state.probeA]];
}


// ============================================================================
// 5. RESPONSIVE CANVAS & MULTI-TIER GEOMETRY
// ============================================================================

function resizeCanvas() {
    const rect = canvasWrap.getBoundingClientRect();
    state.width = Math.floor(rect.width);
    state.height = Math.floor(rect.height);
    state.dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(state.dpr, state.dpr);

    render();
}

window.addEventListener("resize", resizeCanvas);

// Mobile: update canvas hint based on touch support
window.addEventListener("load", () => {
    const hint = document.getElementById("canvasHint");
    if (hint && (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches)) {
        hint.textContent = "drag to move probe · pinch to zoom · two-finger pan";
    }
});

function getPaneGeometry(tierIdx) {
    const totalTiers = Math.max(1, state.tierCount);
    const isNarrow   = state.width < 550;
    const paddingX     = isNarrow ? 42 : 64;
    const headerHeight = isNarrow ? 34 : 28;   // 2-line header on mobile needs extra room
    const bottomPad    = isNarrow ? 16 : 22;

    const availableH = state.height;
    const paneH = availableH / totalTiers;
    const topY = paneH * tierIdx;

    const plotX = paddingX;
    const plotY = topY + headerHeight;
    const plotW = Math.max(10, state.width - paddingX * 2);
    const plotH = Math.max(10, paneH - headerHeight - bottomPad);

    return {
        topY,
        paneH,
        plotX,
        plotY,
        plotW,
        plotH
    };
}

function mathToCanvas(x, y, pane, yMin, yMax) {
    const normX = (x - state.xMin) / (state.xMax - state.xMin);
    const normY = (y - yMin) / (yMax - yMin);

    const px = pane.plotX + normX * pane.plotW;
    const py = pane.plotY + (1 - normY) * pane.plotH;
    return { x: px, y: py };
}

function canvasToMathX(px) {
    const pane = getPaneGeometry(0);
    const normX = (px - pane.plotX) / pane.plotW;
    return state.xMin + normX * (state.xMax - state.xMin);
}

function canvasToMathY(py, tierIdx) {
    const pane = getPaneGeometry(tierIdx);
    const bounds = state.paneYBounds[tierIdx] || { yMin: -10, yMax: 10 };
    const normY = 1 - (py - pane.plotY) / pane.plotH;
    return bounds.yMin + normY * (bounds.yMax - bounds.yMin);
}

function getPaneAtY(py) {
    const totalTiers = Math.max(1, state.tierCount);
    const paneH = state.height / totalTiers;
    const idx = Math.floor(py / paneH);
    return Math.max(0, Math.min(totalTiers - 1, idx));
}


// ============================================================================
// 6. MAIN DRAWING ROUTINE
// ============================================================================

function render() {
    const W = state.width;
    const H = state.height;

    ctx.clearRect(0, 0, W, H);

    const a = state.probeA;
    const probePoints = [];

    // Render each stacked tier
    for (let k = 0; k < state.tierCount; k++) {
        const meta = TIER_META[k] || { order: k, label: `f⁽${k}⁾(x)`, title: `DERIVATIVE TIER ${k}`, color: "#35e0d0" };
        const pane = getPaneGeometry(k);
        const bounds = state.paneYBounds[k] || { yMin: -10, yMax: 10 };
        const { yMin, yMax } = bounds;

        // 1. Divider line between panes
        if (k > 0) {
            ctx.strokeStyle = "rgba(28, 58, 61, 0.8)";
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, pane.topY);
            ctx.lineTo(W, pane.topY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 2. Pane Header & Live Labels
        const valAtA = evalTier(k, a);
        const slopeAtA = evalTier(k + 1, a);
        const valStr   = Number.isFinite(valAtA)   ? valAtA.toFixed(2)   : "undef";
        const slopeStr = Number.isFinite(slopeAtA) ? (slopeAtA >= 0 ? `+${slopeAtA.toFixed(2)}` : slopeAtA.toFixed(2)) : "undef";

        const isNarrow = state.width < 550;
        const headerFontSize = isNarrow ? 9 : 11;
        ctx.font = `${headerFontSize}px 'DM Mono', monospace`;

        if (isNarrow) {
            // Compact 2-line layout: tier label left, values below on second line
            ctx.fillStyle = meta.color;
            ctx.textAlign = "left";
            ctx.fillText(`[${meta.label}] ${meta.title}`, pane.plotX, pane.topY + 12);

            ctx.fillStyle = "rgba(223, 250, 244, 0.65)";
            ctx.fillText(`a=${a.toFixed(2)}  y=${valStr}  m=${slopeStr}`, pane.plotX, pane.topY + 24);
        } else {
            // Full single-line layout for wider screens
            ctx.fillStyle = meta.color;
            ctx.textAlign = "left";
            ctx.fillText(`[${meta.label}] ${meta.title}`, pane.plotX, pane.topY + 18);

            ctx.textAlign = "right";
            ctx.fillStyle = "rgba(223, 250, 244, 0.75)";
            ctx.fillText(`(a = ${a.toFixed(2)}, y = ${valStr})  ·  slope = ${slopeStr}`, pane.plotX + pane.plotW, pane.topY + 18);
        }

        // 3. Grid & Coordinate Axes
        drawPaneGrid(pane, yMin, yMax);

        // 4. Traced Curve Segments (glowing main curve)
        drawCurve(k, pane, yMin, yMax, true);

        // 5. Tangent Line & Slope Vector on Tier k
        const ptA = mathToCanvas(a, valAtA, pane, yMin, yMax);
        probePoints.push(ptA);

        if (Number.isFinite(valAtA) && Number.isFinite(slopeAtA) && Math.abs(valAtA) < 1e5 && Math.abs(slopeAtA) < 1e5) {
            if (state.showTangent) {
                drawTangentLine(k, a, valAtA, slopeAtA, pane, yMin, yMax, meta.color);
            }

            // Auto-reveal differential slope triangle when zoomed close
            const isZoomedClose = (state.xMax - state.xMin) <= 8.0;
            if (isZoomedClose) {
                drawSlopeTriangle(k, a, valAtA, slopeAtA, pane, yMin, yMax, meta.color);
            }
        }

        // 6. Contact Point Halo & Core Dot
        if (Number.isFinite(valAtA) && Math.abs(valAtA) < 1e5) {
            if (ptA.y >= pane.plotY - 10 && ptA.y <= pane.plotY + pane.plotH + 10) {
                const grad = ctx.createRadialGradient(ptA.x, ptA.y, 2, ptA.x, ptA.y, 14);
                grad.addColorStop(0, meta.color);
                grad.addColorStop(1, "transparent");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(ptA.x, ptA.y, 14, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = meta.color;
                ctx.strokeStyle = "#071015";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ptA.x, ptA.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    // 7. Synchronized Vertical Laser Beam across all tiers
    if (state.showGuide && probePoints.length > 0) {
        ctx.strokeStyle = "rgba(53, 224, 208, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        const firstPt = probePoints[0];
        ctx.beginPath();
        ctx.moveTo(firstPt.x, 0);
        ctx.lineTo(firstPt.x, H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cascading connectors from tier k to tier k+1
        for (let k = 0; k < probePoints.length - 1; k++) {
            const pFrom = probePoints[k];
            const pTo = probePoints[k + 1];

            if (Number.isFinite(pFrom.y) && Number.isFinite(pTo.y)) {
                ctx.strokeStyle = "rgba(255, 107, 157, 0.45)";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 4]);
                ctx.beginPath();
                ctx.moveTo(pFrom.x, pFrom.y);
                ctx.lineTo(pTo.x, pTo.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    updateLiveReadouts();
}

/**
 * Draws coordinate axes and grid lines for a pane
 */
function drawPaneGrid(pane, yMin, yMax) {
    ctx.lineWidth = 1;
    ctx.font = "9px 'DM Mono', monospace";
    ctx.textAlign = "center";

    // Horizontal grid lines (Y-axis ticks)
    const ySpan = yMax - yMin;
    const yStep = chooseNiceStep(ySpan / 4);
    const startY = Math.ceil(yMin / yStep) * yStep;

    for (let yVal = startY; yVal <= yMax; yVal += yStep) {
        if (Math.abs(yVal) < 1e-6) continue;
        const pt = mathToCanvas(state.xMin, yVal, pane, yMin, yMax);
        if (pt.y >= pane.plotY && pt.y <= pane.plotY + pane.plotH) {
            ctx.strokeStyle = "rgba(28, 58, 61, 0.45)";
            ctx.beginPath();
            ctx.moveTo(pane.plotX, pt.y);
            ctx.lineTo(pane.plotX + pane.plotW, pt.y);
            ctx.stroke();

            ctx.fillStyle = "rgba(113, 147, 143, 0.7)";
            ctx.textAlign = "right";
            ctx.fillText(yVal.toFixed(yStep < 1 ? 1 : 0), pane.plotX - 6, pt.y + 3);
        }
    }

    // Vertical grid lines (X-axis ticks)
    const xSpan = state.xMax - state.xMin;
    const xStep = chooseNiceStep(xSpan / 6);
    const startX = Math.ceil(state.xMin / xStep) * xStep;

    for (let xVal = startX; xVal <= state.xMax; xVal += xStep) {
        const pt = mathToCanvas(xVal, 0, pane, yMin, yMax);
        ctx.strokeStyle = "rgba(28, 58, 61, 0.45)";
        ctx.beginPath();
        ctx.moveTo(pt.x, pane.plotY);
        ctx.lineTo(pt.x, pane.plotY + pane.plotH);
        ctx.stroke();

        ctx.fillStyle = "rgba(113, 147, 143, 0.75)";
        ctx.textAlign = "center";
        ctx.fillText(xVal.toFixed(xStep < 1 ? 1 : 0), pt.x, pane.plotY + pane.plotH + 14);
    }

    // Highlighted Zero Y-Axis
    if (yMin <= 0 && yMax >= 0) {
        const zeroPt = mathToCanvas(0, 0, pane, yMin, yMax);
        ctx.strokeStyle = "rgba(53, 224, 208, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pane.plotX, zeroPt.y);
        ctx.lineTo(pane.plotX + pane.plotW, zeroPt.y);
        ctx.stroke();

        ctx.fillStyle = "rgba(53, 224, 208, 0.55)";
        ctx.textAlign = "right";
        ctx.fillText("y = 0", pane.plotX + pane.plotW - 4, zeroPt.y - 4);
    }

    // Highlighted Zero X-Axis
    if (state.xMin <= 0 && state.xMax >= 0) {
        const zeroXPt = mathToCanvas(0, 0, pane, yMin, yMax);
        ctx.strokeStyle = "rgba(53, 224, 208, 0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(zeroXPt.x, pane.plotY);
        ctx.lineTo(zeroXPt.x, pane.plotY + pane.plotH);
        ctx.stroke();
    }
}

/**
 * Draws the function curve with asymptote & glitch elimination
 */
function drawCurve(tierIdx, pane, yMin, yMax, isTracedPass) {
    const meta = TIER_META[tierIdx] || { color: "#35e0d0" };
    const steps = Math.min(1200, Math.floor(pane.plotW * 1.5));
    const dx = (state.xMax - state.xMin) / steps;
    const ySpan = Math.max(yMax - yMin, 1e-6);

    const samples = getTierCurveSamples(tierIdx, steps, state.xMin, state.xMax);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.plotX, pane.plotY, pane.plotW, pane.plotH);
    ctx.clip();

    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 6;
    ctx.setLineDash([]);

    let pathOpen = false;
    let prevY = NaN;

    const flushPath = () => {
        if (pathOpen) {
            ctx.stroke();
            pathOpen = false;
        }
    };

    for (let i = 0; i <= steps; i++) {
        const x = state.xMin + i * dx;

        if (isTracedPass && !isPointTraced(x)) {
            flushPath();
            prevY = NaN;
            continue;
        }

        const y = samples[i];

        const isBad = !Number.isFinite(y) || Math.abs(y) > 1e5;
        const isJump = !isBad && Number.isFinite(prevY) && Math.abs(y - prevY) > ySpan * 3;

        if (isBad || isJump) {
            flushPath();
            prevY = NaN;
            continue;
        }

        const pt = mathToCanvas(x, y, pane, yMin, yMax);

        if (pt.y < pane.plotY - 150 || pt.y > pane.plotY + pane.plotH + 150) {
            flushPath();
            prevY = NaN;
            continue;
        }

        if (!pathOpen) {
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            pathOpen = true;
        } else {
            ctx.lineTo(pt.x, pt.y);
        }
        prevY = y;
    }

    flushPath();
    ctx.restore();
}

/**
 * Draws the tangent line: y - y0 = m * (x - x0)
 */
function drawTangentLine(tierIdx, a, fa, slope, pane, yMin, yMax, color) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.plotX, pane.plotY, pane.plotW, pane.plotH);
    ctx.clip();

    const xLeft = state.xMin;
    const yLeft = fa + slope * (xLeft - a);

    const xRight = state.xMax;
    const yRight = fa + slope * (xRight - a);

    const ptLeft = mathToCanvas(xLeft, yLeft, pane, yMin, yMax);
    const ptRight = mathToCanvas(xRight, yRight, pane, yMin, yMax);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ptLeft.x, ptLeft.y);
    ctx.lineTo(ptRight.x, ptRight.y);
    ctx.stroke();

    // Slope tag badge next to contact
    const contact = mathToCanvas(a, fa, pane, yMin, yMax);
    const tagX = Math.min(pane.plotX + pane.plotW - 85, contact.x + 12);
    const tagY = Math.max(pane.plotY + 15, Math.min(pane.plotY + pane.plotH - 12, contact.y - 10));

    ctx.fillStyle = "rgba(6, 17, 21, 0.88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(tagX, tagY - 10, 76, 18);
    ctx.strokeRect(tagX, tagY - 10, 76, 18);

    ctx.fillStyle = color;
    ctx.font = "10px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`m: ${slope.toFixed(2)}`, tagX + 38, tagY + 3);

    ctx.restore();
}

/**
 * Draws differential slope triangle when zoomed close
 */
function drawSlopeTriangle(tierIdx, a, fa, slope, pane, yMin, yMax, color) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.plotX, pane.plotY, pane.plotW, pane.plotH);
    ctx.clip();

    const domainSpan = state.xMax - state.xMin;
    const deltaX = Math.max(0.12, Math.min(domainSpan * 0.18, 1.2));
    const deltaY = slope * deltaX;

    const p0 = mathToCanvas(a, fa, pane, yMin, yMax);
    const p1 = mathToCanvas(a + deltaX, fa, pane, yMin, yMax);
    const p2 = mathToCanvas(a + deltaX, fa + deltaY, pane, yMin, yMax);

    // Shaded fill
    ctx.fillStyle = "rgba(53, 224, 208, 0.1)";
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();

    // Base (dx / run)
    ctx.strokeStyle = "rgba(53, 224, 208, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // Height (dy / rise)
    ctx.strokeStyle = "rgba(255, 107, 157, 0.85)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Right angle corner indicator
    const cornerSize = Math.min(6, Math.abs(p1.x - p0.x) * 0.35);
    const signY = p2.y < p1.y ? -1 : 1;
    ctx.strokeStyle = "rgba(223, 250, 244, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p1.x - cornerSize, p1.y);
    ctx.lineTo(p1.x - cornerSize, p1.y + signY * cornerSize);
    ctx.lineTo(p1.x, p1.y + signY * cornerSize);
    ctx.stroke();

    // Labels
    ctx.font = "9px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#35e0d0";
    ctx.fillText(`Δx=${deltaX.toFixed(2)}`, (p0.x + p1.x) / 2, p0.y + 13);

    ctx.fillStyle = "#ff6b9d";
    ctx.textAlign = "left";
    ctx.fillText(`Δy=${deltaY.toFixed(2)}`, p1.x + 6, (p1.y + p2.y) / 2 + 3);

    ctx.restore();
}

function chooseNiceStep(targetStep) {
    if (targetStep <= 0 || !Number.isFinite(targetStep)) return 1;
    const exponent = Math.floor(Math.log10(targetStep));
    const fraction = targetStep / Math.pow(10, exponent);
    let nice;
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
    return nice * Math.pow(10, exponent);
}


// ============================================================================
// 7. SIDEBAR READOUTS & STATS
// ============================================================================

function updateLiveReadouts() {
    const a = state.probeA;
    const fA = evalTier(0, a);
    const f1A = evalTier(1, a);
    const f2A = evalTier(2, a);
    const f3A = evalTier(3, a);
    const f4A = evalTier(4, a);
    const f5A = evalTier(5, a);

    if (statTiers) statTiers.textContent = `${state.tierCount} TIERS`;
    if (statX) statX.textContent = a.toFixed(3);
    if (statSlope) statSlope.textContent = Number.isFinite(f1A) ? (f1A >= 0 ? `+${f1A.toFixed(3)}` : f1A.toFixed(3)) : "undef";

    if (readoutA) readoutA.textContent = a.toFixed(3);
    if (readoutF) readoutF.textContent = Number.isFinite(fA) ? fA.toFixed(3) : "undef";
    if (readoutF1) readoutF1.textContent = Number.isFinite(f1A) ? (f1A >= 0 ? `+${f1A.toFixed(3)}` : f1A.toFixed(3)) : "undef";

    if (readoutTanEq) {
        if (Number.isFinite(fA) && Number.isFinite(f1A)) {
            const b = fA - f1A * a;
            const bSign = b >= 0 ? "+" : "-";
            readoutTanEq.textContent = `y = ${f1A.toFixed(2)}x ${bSign} ${Math.abs(b).toFixed(2)}`;
        } else {
            readoutTanEq.textContent = "undefined";
        }
    }

    if (rowReadoutF2 && readoutF2) {
        if (state.tierCount >= 3) {
            rowReadoutF2.style.display = "flex";
            readoutF2.textContent = Number.isFinite(f2A) ? f2A.toFixed(2) : "undef";
        } else {
            rowReadoutF2.style.display = "none";
        }
    }

    if (rowReadoutF3 && readoutF3) {
        if (state.tierCount >= 4) {
            rowReadoutF3.style.display = "flex";
            readoutF3.textContent = Number.isFinite(f3A) ? f3A.toFixed(2) : "undef";
        } else {
            rowReadoutF3.style.display = "none";
        }
    }

    if (rowReadoutF4 && readoutF4) {
        if (state.tierCount >= 5) {
            rowReadoutF4.style.display = "flex";
            readoutF4.textContent = Number.isFinite(f4A) ? f4A.toFixed(2) : "undef";
        } else {
            rowReadoutF4.style.display = "none";
        }
    }

    if (rowReadoutF5 && readoutF5) {
        if (state.tierCount >= 6) {
            rowReadoutF5.style.display = "flex";
            readoutF5.textContent = Number.isFinite(f5A) ? f5A.toFixed(2) : "undef";
        } else {
            rowReadoutF5.style.display = "none";
        }
    }

    if (probeLabel) probeLabel.textContent = a.toFixed(3);
    if (probeInput && document.activeElement !== probeInput) {
        probeInput.min = state.xMin;
        probeInput.max = state.xMax;
        probeInput.value = a;
    }
}

function updateTierChips() {
    if (!tierChipsContainer) return;
    tierChipsContainer.innerHTML = "";
    for (let k = 0; k < state.tierCount; k++) {
        const meta = TIER_META[k] || { label: `f⁽${k}⁾(x)` };
        const chip = document.createElement("div");
        chip.className = `tier-chip tier-${k}`;
        chip.innerHTML = `<span class="chip-dot"></span><span>${meta.label}</span>`;
        tierChipsContainer.appendChild(chip);
    }
    if (tierCountLabel) tierCountLabel.textContent = `${state.tierCount} TIERS`;
}


// ============================================================================
// 8. ANIMATION LOOP & SWEEP ENGINE
// ============================================================================

function tick(now) {
    const dt = (now - state.lastFrameTime) / 1000;
    state.lastFrameTime = now;

    if (state.animating) {
        const speed = state.animSpeed * (state.xMax - state.xMin) * 0.25;
        let nextA = state.probeA + state.animDirection * speed * dt;

        if (nextA > state.xMax) {
            nextA = state.xMax;
            state.animDirection = -1;
        } else if (nextA < state.xMin) {
            nextA = state.xMin;
            state.animDirection = 1;
        }

        setProbePosition(nextA);
    }

    requestAnimationFrame(tick);
}

function setProbePosition(newA) {
    const clamped = Math.max(state.xMin, Math.min(state.xMax, newA));
    state.prevProbeA = state.probeA;
    state.probeA = clamped;

    if (state.drawMode === 'live') {
        recordTraceCoverage(state.prevProbeA, state.probeA);
    }

    // Keep all graphs (including the primary function and all derivatives) centered on their probe points at the identical vertical scale
    for (let k = 0; k < 7; k++) {
        const yVal = evalTier(k, clamped);
        if (Number.isFinite(yVal) && Math.abs(yVal) < 1e5) {
            const curSpanY = state.paneYBounds[k].yMax - state.paneYBounds[k].yMin;
            state.paneYBounds[k].yMin = yVal - curSpanY / 2;
            state.paneYBounds[k].yMax = yVal + curSpanY / 2;
        }
    }

    render();
}


// ============================================================================
// 9. 2D ISOTROPIC PANNING & ZOOMING (1:1 SCALING ON BOTH AXES)
// ============================================================================

function handlePan(deltaPxX, deltaPxY) {
    const pane = getPaneGeometry(0);
    const spanX = state.panInitMaxX - state.panInitMinX;
    const mathDeltaX = (deltaPxX / pane.plotW) * spanX;

    state.xMin = state.panInitMinX - mathDeltaX;
    state.xMax = state.panInitMaxX - mathDeltaX;

    // Pan Y for all tiers simultaneously (1:1 mapping with pixel motion)
    for (let k = 0; k < 7; k++) {
        const p = getPaneGeometry(k);
        const initB = state.panInitPaneYBounds[k] || { yMin: -10, yMax: 10 };
        const spanY = initB.yMax - initB.yMin;
        const mathDeltaY = (deltaPxY / p.plotH) * spanY;
        state.paneYBounds[k].yMin = initB.yMin + mathDeltaY;
        state.paneYBounds[k].yMax = initB.yMax + mathDeltaY;
    }

    render();
}

function zoomAt(mousePxX, mousePxY, factor) {
    const activeTier = getPaneAtY(mousePxY);
    const pane = getPaneGeometry(activeTier);
    const centerMathX = canvasToMathX(mousePxX);
    const centerMathY = canvasToMathY(mousePxY, activeTier);

    const curSpanX = state.xMax - state.xMin;
    const newSpanX = Math.max(0.01, Math.min(10000, curSpanX * factor));
    const ratioX = (centerMathX - state.xMin) / curSpanX;

    state.xMin = centerMathX - ratioX * newSpanX;
    state.xMax = centerMathX + (1 - ratioX) * newSpanX;

    // Zoom Y simultaneously at the exact same 1:1 factor across tiers
    for (let k = 0; k < 7; k++) {
        const b = state.paneYBounds[k];
        const curSpanY = b.yMax - b.yMin;
        const newSpanY = Math.max(0.01, Math.min(10000, curSpanY * factor));
        const ratioY = (centerMathY - b.yMin) / curSpanY;
        b.yMin = centerMathY - ratioY * newSpanY;
        b.yMax = centerMathY + (1 - ratioY) * newSpanY;
    }

    render();
}

// Reset view to default 10x10 domain and 10x10 Y-bounds for all tiers
function resetZoom() {
    state.xMin = -10.0;
    state.xMax =  10.0;
    state.paneYBounds = Array.from({ length: 7 }, () => ({ yMin: -10.0, yMax: 10.0 }));
    state.probeA = 1.0;
    state.prevProbeA = 1.0;
    resetTrace();
    render();
}


// ============================================================================
// 10. EVENT LISTENERS & USER INTERACTIONS
// ============================================================================

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Pointer Events: Left = Probe scrubber, Right/Middle = 2D Pan
canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    const isRightOrMiddle = (e.button === 2 || e.button === 1 || e.buttons === 2 || e.buttons === 4);
    const isDoubleClick = (e.detail >= 2);
    const isModifierPan = (e.shiftKey || e.altKey || e.ctrlKey);

    if (isRightOrMiddle || isDoubleClick || isModifierPan) {
        // Right click, middle click, double-click drag, or Shift/Alt/Ctrl drag -> 2D Pan
        e.preventDefault();
        state.isPanning = true;
        state.isDragging = false;
        state.panStartX = e.clientX;
        state.panStartY = e.clientY;
        state.panInitMinX = state.xMin;
        state.panInitMaxX = state.xMax;
        state.panInitPaneYBounds = state.paneYBounds.map(b => ({ ...b }));
        canvas.style.cursor = "grabbing";
        return;
    }

    if (e.button === 0) {
        state.isDragging = true;
        const rect = canvas.getBoundingClientRect();
        const mathX = canvasToMathX(e.clientX - rect.left);
        setProbePosition(mathX);
    }
});

// Edge-pan: continuously scroll when probe drags near edge
const EDGE_ZONE = 0.10;  // 10% of canvas width triggers edge-pan
const EDGE_MAX_SPEED = 4; // max math-units per second at very edge

function startEdgePan() {
    if (state.edgePanRAF !== null) return; // already running
    let lastTime = performance.now();

    function loop(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.1); // cap delta to 100ms
        lastTime = now;

        if (!state.isDragging || state.edgePanVelocity === 0) {
            state.edgePanRAF = null;
            return;
        }

        const shift = state.edgePanVelocity * dt;
        state.xMin += shift;
        state.xMax += shift;

        // Shift all pane Y-bounds proportionally so view tracks probe
        // (no Y-pan during edge-pan; only X scrolls)

        // Clamp probe to stay within view
        const clamped = Math.max(state.xMin, Math.min(state.xMax, state.probeA + shift));
        state.prevProbeA = state.probeA;
        state.probeA = clamped;
        if (state.drawMode === 'live') {
            recordTraceCoverage(state.prevProbeA, state.probeA);
        }

        render();
        state.edgePanRAF = requestAnimationFrame(loop);
    }

    state.edgePanRAF = requestAnimationFrame(loop);
}

function stopEdgePan() {
    state.edgePanVelocity = 0;
    if (state.edgePanRAF !== null) {
        cancelAnimationFrame(state.edgePanRAF);
        state.edgePanRAF = null;
    }
}

canvas.addEventListener("pointermove", (e) => {
    // Detect mid-drag right-click or modifier pan trigger (useful for trackpads)
    if ((e.buttons === 2 || e.buttons === 4 || e.shiftKey || e.altKey || e.ctrlKey) && !state.isPanning && !state.isDragging) {
        state.isPanning = true;
        state.panStartX = e.clientX;
        state.panStartY = e.clientY;
        state.panInitMinX = state.xMin;
        state.panInitMaxX = state.xMax;
        state.panInitPaneYBounds = state.paneYBounds.map(b => ({ ...b }));
        canvas.style.cursor = "grabbing";
    }

    if (state.isPanning) {
        const deltaPxX = e.clientX - state.panStartX;
        const deltaPxY = e.clientY - state.panStartY;
        handlePan(deltaPxX, deltaPxY);
        return;
    }

    if (!state.isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const mathX = canvasToMathX(localX);
    setProbePosition(mathX);

    // Edge-pan: compute velocity based on how close to the canvas edge we are
    const pane = getPaneGeometry(0);
    const plotLeft  = pane.plotX;
    const plotRight = pane.plotX + pane.plotW;
    const edgePx    = pane.plotW * EDGE_ZONE;

    if (localX < plotLeft + edgePx) {
        // Near left edge: pan left (negative)
        const depth = 1 - Math.max(0, (localX - plotLeft) / edgePx);
        const mathSpan = state.xMax - state.xMin;
        state.edgePanVelocity = -depth * depth * EDGE_MAX_SPEED * mathSpan;
        startEdgePan();
    } else if (localX > plotRight - edgePx) {
        // Near right edge: pan right (positive)
        const depth = 1 - Math.max(0, (plotRight - localX) / edgePx);
        const mathSpan = state.xMax - state.xMin;
        state.edgePanVelocity = depth * depth * EDGE_MAX_SPEED * mathSpan;
        startEdgePan();
    } else {
        stopEdgePan();
    }
});

canvas.addEventListener("pointerup", (e) => {
    state.isDragging = false;
    state.isPanning = false;
    stopEdgePan();
    canvas.style.cursor = "crosshair";
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
});

canvas.addEventListener("pointercancel", () => {
    state.isDragging = false;
    state.isPanning = false;
    stopEdgePan();
    canvas.style.cursor = "crosshair";
});

// Wheel / Trackpad with 1:1 2D zoom and 2D pan
let _wheelLastTime = 0;
let _wheelAccumDelta = 0;

canvas.addEventListener("wheel", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mousePxX = e.clientX - rect.left;
    const mousePxY = e.clientY - rect.top;

    const pane0 = getPaneGeometry(0);
    // Allow natural page scrolling when cursor is outside the graph plot box
    if (mousePxX < pane0.plotX || mousePxX > pane0.plotX + pane0.plotW) {
        return;
    }

    e.preventDefault();

    if (e.ctrlKey) {
        // Trackpad pinch-to-zoom (isotropic 1:1)
        const zoomFactor = Math.exp(e.deltaY * 0.0035);
        zoomAt(mousePxX, mousePxY, zoomFactor);
        return;
    }

    const pixelMag = Math.abs(e.deltaX) + Math.abs(e.deltaY);
    const isTrackpadScroll = (e.deltaMode === 0 && pixelMag < 60);

    if (isTrackpadScroll) {
        // Trackpad two-finger scroll -> 2D Pan
        const pane = getPaneGeometry(0);
        const spanX = state.xMax - state.xMin;
        const panDeltaX = (e.deltaX / pane.plotW) * spanX * 0.8;

        state.xMin += panDeltaX;
        state.xMax += panDeltaX;

        for (let k = 0; k < 7; k++) {
            const p = getPaneGeometry(k);
            const spanY = state.paneYBounds[k].yMax - state.paneYBounds[k].yMin;
            const panDeltaY = -(e.deltaY / p.plotH) * spanY * 0.8;
            state.paneYBounds[k].yMin += panDeltaY;
            state.paneYBounds[k].yMax += panDeltaY;
        }

        render();
    } else {
        // Mouse wheel -> smooth 1:1 zoom centered on cursor
        const now = performance.now();
        _wheelAccumDelta += e.deltaY * (e.deltaMode === 1 ? 30 : 1);

        if (now - _wheelLastTime > 16) {
            _wheelLastTime = now;
            const zoomFactor = Math.exp(_wheelAccumDelta * 0.0018);
            _wheelAccumDelta = 0;
            zoomAt(mousePxX, mousePxY, zoomFactor);
        }
    }
}, { passive: false });


// Formula Text Input (deselects presets on custom input)
if (fnInput) {
    fnInput.addEventListener("input", (e) => {
        presetButtons.forEach(b => b.classList.remove("primary"));
        compileEquation(e.target.value.trim());
    });
}

// Preset Buttons
presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        presetButtons.forEach(b => b.classList.remove("primary"));
        btn.classList.add("primary");

        const expr = btn.dataset.fn;
        if (fnInput) fnInput.value = expr;
        compileEquation(expr);
        resetZoom();
    });
});

// Add / Remove Derivative Tiers (up to 6 orders)
if (addTierBtn) {
    addTierBtn.addEventListener("click", () => {
        if (state.tierCount < 6) {
            state.tierCount++;
            updateTierChips();
            resetTrace();
            render();
        }
    });
}

if (removeTierBtn) {
    removeTierBtn.addEventListener("click", () => {
        if (state.tierCount > 1) {
            state.tierCount--;
            updateTierChips();
            render();
        }
    });
}

// Reset view button
if (resetZoomBtn) {
    resetZoomBtn.addEventListener("click", resetZoom);
}

// Draw Mode Selector
function setDrawMode(mode) {
    state.drawMode = mode;
    if (modeLive) modeLive.classList.toggle("active", mode === 'live');
    if (modeFull) modeFull.classList.toggle("active", mode === 'full');

    if (drawStatusText) {
        if (mode === 'live') {
            drawStatusText.textContent = "LIVE TRACING";
        } else if (mode === 'full') {
            drawStatusText.textContent = "FULL CASCADE";
        }
    }

    render();
}

if (modeLive) modeLive.addEventListener("click", () => setDrawMode('live'));
if (modeFull) modeFull.addEventListener("click", () => setDrawMode('full'));

if (drawFullBtn) {
    drawFullBtn.addEventListener("click", () => {
        setDrawMode('full');
    });
}

if (clearTraceBtn) {
    clearTraceBtn.addEventListener("click", () => {
        resetTrace();
        setDrawMode('live');
        render();
    });
}

// Probe Slider
if (probeInput) {
    probeInput.addEventListener("input", (e) => {
        setProbePosition(parseFloat(e.target.value));
    });
}

// Sweep Play/Pause
if (playBtn) {
    playBtn.addEventListener("click", () => {
        state.animating = !state.animating;
        playBtn.textContent = state.animating ? "pause sweep" : "auto sweep";
        playBtn.classList.toggle("primary", !state.animating);
        if (drawStatusText) {
            drawStatusText.textContent = state.animating ? "AUTO SWEEP ACTIVE" : (state.drawMode.toUpperCase() + " ACTIVE");
        }
    });
}

// Display Toggles
if (toggleTangent) {
    toggleTangent.addEventListener("change", (e) => {
        state.showTangent = e.target.checked;
        render();
    });
}

if (toggleGuide) {
    toggleGuide.addEventListener("change", (e) => {
        state.showGuide = e.target.checked;
        render();
    });
}

// Keyboard Shortcuts
window.addEventListener("keydown", (e) => {
    if (document.activeElement === fnInput) return;

    const step = (state.xMax - state.xMin) * 0.01;
    if (e.key === "ArrowLeft") {
        setProbePosition(state.probeA - step);
        e.preventDefault();
    } else if (e.key === "ArrowRight") {
        setProbePosition(state.probeA + step);
        e.preventDefault();
    } else if (e.key === " ") {
        if (playBtn) playBtn.click();
        e.preventDefault();
    } else if (e.key === "r" || e.key === "R") {
        if (clearTraceBtn) clearTraceBtn.click();
    } else if (e.key === "+" || e.key === "=") {
        if (addTierBtn) addTierBtn.click();
    } else if (e.key === "-" || e.key === "_") {
        if (removeTierBtn) removeTierBtn.click();
    } else if (e.key === "f" || e.key === "F") {
        if (drawFullBtn) drawFullBtn.click();
    }
});


// ============================================================================
// 11. INITIALIZATION
// ============================================================================

// Mobile controls drawer toggle
const controlsToggle = document.getElementById("controlsToggle");
const controlsPanel  = document.querySelector(".controls");

if (controlsToggle && controlsPanel) {
    controlsToggle.addEventListener("click", () => {
        const isOpen = controlsPanel.classList.toggle("open");
        controlsToggle.textContent = isOpen ? "✕" : "⚙";
        controlsToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Tapping the backdrop (canvas) while panel is open closes it
    canvas.addEventListener("pointerdown", () => {
        if (controlsPanel.classList.contains("open")) {
            controlsPanel.classList.remove("open");
            controlsToggle.textContent = "⚙";
            controlsToggle.setAttribute("aria-expanded", "false");
        }
    }, { capture: true });
}

function init() {
    updateTierChips();
    compileEquation(state.rawFn);
    resetZoom();
    resizeCanvas();
    requestAnimationFrame(tick);
}

init();
