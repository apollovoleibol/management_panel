const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = html.indexOf('// PAYMENT_PACKAGE_CORE_START');
const end = html.indexOf('// PAYMENT_PACKAGE_CORE_END');
assert.ok(start >= 0 && end > start, 'O módulo de regras de mensalidade deve existir no HTML');
const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);
const core = context.PaymentPackages;

test('scripts inline do painel permanecem sintaticamente válidos', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1].trim()).filter(Boolean);
  assert.ok(scripts.length > 0);
  scripts.forEach(source => assert.doesNotThrow(() => new Function(source)));
});

test('padroniza valores antigos e preserva a taxa de matrícula', () => {
  assert.equal(core.normalize('1x por semana - R$ 98,90'), '1x por semana - R$ 98,90 - sem taxa de matrícula');
  assert.equal(core.normalize('2x por semana - R$ 176,90 + matrícula R$ 70,00'), '2x por semana - R$ 176,90 - com taxa de matrícula de R$ 70,00');
  assert.equal(core.normalize('plano sem valor conhecido'), null);
});

test('formata um pacote a partir de valores inteiros em centavos', () => {
  assert.equal(core.format({ days: 3, monthlyCents: 18990, enrollmentCents: 0 }), '3x por semana - R$ 189,90 - sem taxa de matrícula');
  assert.equal(core.format({ days: 2, monthlyCents: 17690, enrollmentCents: 7000 }), '2x por semana - R$ 176,90 - com taxa de matrícula de R$ 70,00');
  assert.throws(() => core.format({ days: 0, monthlyCents: 10000, enrollmentCents: 0 }));
});

test('calcula o impacto mensal absoluto e percentual do reajuste', () => {
  assert.equal(JSON.stringify(core.impact(10990, 11990)), JSON.stringify({ deltaCents: 1000, percent: 9.1 }));
  assert.equal(JSON.stringify(core.impact(10000, 9500)), JSON.stringify({ deltaCents: -500, percent: -5 }));
});

test('estima o impacto total apenas para atletas ativos do pacote e equipes afetadas', () => {
  const oldLabel = '1x por semana - R$ 98,90 - sem taxa de matrícula';
  const rows = [
    { id: 'a1', team_id: 'a', payment_plan: '1x por semana - R$ 98,90', is_active: true },
    { id: 'a2', team_id: 'b', payment_plan: oldLabel, is_active: true },
    { id: 'a3', team_id: 'b', payment_plan: oldLabel, is_active: false },
    { id: 'a4', team_id: 'c', payment_plan: oldLabel, is_active: true },
  ];
  const matched = core.matchingAthletes(rows, ['a', 'b'], oldLabel);
  assert.equal(JSON.stringify(matched.map(r => r.id)), JSON.stringify(['a1', 'a2']));
  assert.equal(JSON.stringify(core.portfolioImpact(9890, 10990, matched.length)), JSON.stringify({ count: 2, beforeCents: 19780, afterCents: 21980, deltaCents: 2200, percent: 11.1 }));
});

test('agrupa pacotes por núcleo e registra equipes associadas', () => {
  const teams = [
    { id: 'a', location_id: 'n1', available_payment_plans: ['1x por semana - R$ 98,90'] },
    { id: 'b', location_id: 'n1', available_payment_plans: ['1x por semana - R$ 98,90 (sem taxa de matrícula)'] },
    { id: 'c', location_id: 'n2', available_payment_plans: ['1x por semana - R$ 98,90'] },
  ];
  const catalog = core.catalog(teams, 'n1');
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].label, '1x por semana - R$ 98,90 - sem taxa de matrícula');
  assert.equal(JSON.stringify([...catalog[0].teamIds].sort()), JSON.stringify(['a', 'b']));
});

test('prepara reajuste apenas nas equipes associadas ao núcleo escolhido', () => {
  const teams = [
    { id: 'a', location_id: 'n1', available_payment_plans: ['1x por semana - R$ 98,90', '2x por semana - R$ 149,90'] },
    { id: 'b', location_id: 'n1', available_payment_plans: ['1x por semana - R$ 98,90 (sem taxa de matrícula)'] },
    { id: 'c', location_id: 'n2', available_payment_plans: ['1x por semana - R$ 98,90'] },
  ];
  const changes = core.planReprice(teams, 'n1', '1x por semana - R$ 98,90 - sem taxa de matrícula', '1x por semana - R$ 109,90 - sem taxa de matrícula');
  assert.equal(changes.length, 2);
  assert.equal(JSON.stringify(changes.map(c => c.teamId)), JSON.stringify(['a', 'b']));
  assert.equal(JSON.stringify(changes[0].next), JSON.stringify(['1x por semana - R$ 109,90 - sem taxa de matrícula', '2x por semana - R$ 149,90']));
  assert.equal(teams[2].available_payment_plans[0], '1x por semana - R$ 98,90');
});

test('atribui um pacote a várias equipes do mesmo núcleo sem afetar as demais', () => {
  const label = '2x por semana - R$ 159,90 - sem taxa de matrícula';
  const teams = [
    { id: 'a', location_id: 'n1', available_payment_plans: [], schedules: { 1: { start: '18:00' }, 3: { start: '18:00' } } },
    { id: 'b', location_id: 'n1', available_payment_plans: [label], schedules: { 1: { start: '18:00' }, 3: { start: '18:00' } } },
    { id: 'c', location_id: 'n2', available_payment_plans: [], schedules: {} },
  ];
  const changes = core.planAssignments(teams, 'n1', label, ['a']);
  assert.equal(JSON.stringify(changes.map(c => c.teamId)), JSON.stringify(['a', 'b']));
  assert.equal(JSON.stringify(changes[0].next), JSON.stringify([label]));
  assert.equal(JSON.stringify(changes[1].next), JSON.stringify([]));
  assert.throws(() => core.planAssignments(teams, 'n1', label, ['c']));
});
