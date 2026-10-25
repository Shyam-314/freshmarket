// test-sections.js — runs the real product-section block from script.js against a
// tiny DOM stub and checks the "one row + Show all" behaviour.
'use strict';

const fs = require('fs');
const path = require('path');

// Works from the project (server/test-sections.js) and from the workspace copy
const candidates = [
    path.join(__dirname, '..', 'script.js'),
    path.join(__dirname, '..', 'public', 'script.js'),
    'C:/Users/M SHYAM/Desktop/Groceries Webpage/script.js'
];
const scriptFile = candidates.find(file => fs.existsSync(file));
if (!scriptFile) throw new Error('script.js not found');
const source = fs.readFileSync(scriptFile, 'utf8');

const start = source.indexOf('// ---------- product sections: one row at a time ----------');
const marker = 'initProductSections();';
const end = source.indexOf(marker);
if (start < 0 || end < 0) throw new Error('product-section block not found in script.js');
const block = source.slice(start, end + marker.length);

// ---------- stub DOM ----------

class ClassList {
    constructor() { this.set = new Set(); }
    add(...names) { names.forEach(name => this.set.add(name)); }
    remove(...names) { names.forEach(name => this.set.delete(name)); }
    contains(name) { return this.set.has(name); }
    toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : Boolean(force);
        if (on) this.set.add(name); else this.set.delete(name);
        return on;
    }
}

function element(tag = 'div') {
    return {
        tag,
        children: [],
        classList: new ClassList(),
        className: '',
        textContent: '',
        attrs: {},
        listeners: {},
        appendChild(child) { this.children.push(child); return child; },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        setAttribute(name, value) { this.attrs[name] = value; },
        after(node) { this.afterNode = node; node.after = this; },
        querySelector(selector) {
            if (selector === '.row') return this.row || null;
            if (selector === '[data-product-count]') return this.badge || null;
            return null;
        }
    };
}

function makeSection(count) {
    const section = element('section');
    const row = element('div');
    const badge = element('span');
    const items = [];

    for (let index = 0; index < count; index += 1) {
        const item = element('div');
        item.classList.add('col');
        row.appendChild(item);
        items.push(item);
    }

    section.row = row;
    section.badge = badge;
    return { section, row, items, badge };
}

const sections = [makeSection(20), makeSection(20), makeSection(3)];
const noResults = element('div');

const viewport = { wide: true };
const documentStub = {
    querySelectorAll: selector => selector === 'main section' ? sections.map(entry => entry.section) : [],
    getElementById: id => id === 'no-results' ? noResults : null,
    createElement: tag => element(tag)
};
const windowStub = {
    matchMedia: query => ({
        matches: query.includes('992') ? viewport.wide : query.includes('768') ? true : false
    }),
    addEventListener: () => {}
};
const searchInput = { value: '' };

const factory = new Function('document', 'window', 'searchInput', 'sections',
    block + '\nreturn { sectionRows, applyAllCollapse };');
const api = factory(documentStub, windowStub, searchInput, sections.map(entry => entry.section));

let failures = 0;
const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures += 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '  = ' + JSON.stringify(actual)
        : '  expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)));
};

const visibleCount = entry => entry.items.filter(item => !item.classList.contains('product-hidden')).length;
const controlOf = entry => entry.row.afterNode;

// ---------- initial state ----------
check('two sections registered as collapsible rows', api.sectionRows.length, 3);
check('first section shows one row (5)', visibleCount(sections[0]), 5);
check('fifteenth item is hidden', sections[0].items[14].classList.contains('product-hidden'), true);

check('badge shows item count', sections[0].badge.textContent, '20 items');
check('control label', controlOf(sections[0]).children[0].children[0].textContent, 'Show all 20');
check('control visible for long section', controlOf(sections[0]).classList.contains('d-none'), false);
check('small section hides the control', controlOf(sections[2]).classList.contains('d-none'), true);
check('small section shows all items', visibleCount(sections[2]), 3);

// ---------- expand / collapse ----------
{
    const button = controlOf(sections[0]).children[0];
    button.listeners.click[0]();

    check('expanded: all items visible', visibleCount(sections[0]), 20);
    check('expanded: label flips to Show less', button.children[0].textContent, 'Show less');
    check('expanded: icon flips to chevron-up', button.children[1].className.includes('chevron-up'), true);
    check('expanded: aria-expanded true', button.attrs['aria-expanded'], 'true');

    button.listeners.click[0]();
    check('collapsed again: one row visible', visibleCount(sections[0]), 5);
    check('collapsed again: label restored', button.children[0].textContent, 'Show all 20');
}

// ---------- search ignores the collapse ----------
{
    searchInput.value = 'apple';
    api.applyAllCollapse();

    check('searching: control hidden', controlOf(sections[0]).classList.contains('d-none'), true);
    check('searching: every item unhidden', visibleCount(sections[0]), 20);

    searchInput.value = '';
    api.applyAllCollapse();
    check('search cleared: collapse returns', visibleCount(sections[0]), 5);
}

// ---------- responsive row size ----------
{
    viewport.wide = false; // 768–991px → 3 per row
    api.applyAllCollapse();
    check('smaller viewport: 3 per row', visibleCount(sections[0]), 3);
}

console.log('\n' + (failures === 0 ? 'ALL SECTION CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
