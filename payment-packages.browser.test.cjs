const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

test('administrador vê pacotes por núcleo e só confirma reajuste após simulação', async () => {
  const browser = await chromium.launch({ ...(fs.existsSync(edgePath) ? { executablePath: edgePath } : {}), headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.evaluate(() => {
      window.tailwind = { config: {} };
      window.supabase = { createClient: () => ({ auth: { onAuthStateChange() {} } }) };
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      currentUserRole = 'admin';
      cfTrainingLocations = [
        { id: 'n1', name: 'Núcleo Centro' },
        { id: 'n2', name: 'Núcleo Sul' },
      ];
      cfTeams = [
        { id: 'a', name: 'Equipe A', location_id: 'n1', available_payment_plans: ['1x por semana - R$ 98,90'], schedules: { 1: { start: '18:00', end: '19:00' } }, unavail: [], age_min: 10, age_max: 17, gender: 'Misto', available_for_booking: true },
        { id: 'b', name: 'Equipe B', location_id: 'n1', available_payment_plans: ['1x por semana - R$ 98,90'], schedules: { 1: { start: '19:00', end: '20:00' } }, unavail: [], age_min: 10, age_max: 17, gender: 'Misto', available_for_booking: true },
        { id: 'c', name: 'Equipe C', location_id: 'n2', available_payment_plans: ['1x por semana - R$ 119,90'], schedules: { 1: { start: '18:00', end: '19:00' } }, unavail: [], age_min: 10, age_max: 17, gender: 'Misto', available_for_booking: true },
      ];
      cfActiveId = 'a';
      renderCFContent();
    });
    assert.match(await page.locator('#cf-plans-container').innerText(), /NÚCLEO CENTRO/i);
    assert.doesNotMatch(await page.locator('#cf-plans-container').innerText(), /119,90/);
    await page.locator('#cf-package-manage-button').click();
    await page.evaluate(() => {
      window.__athletes = [
        { id: 'a1', team_id: 'a', payment_plan: '1x por semana - R$ 98,90', is_active: true },
        { id: 'b1', team_id: 'b', payment_plan: '1x por semana - R$ 98,90', is_active: true },
        { id: 'b2', team_id: 'b', payment_plan: '1x por semana - R$ 98,90', is_active: false },
        { id: 'c1', team_id: 'c', payment_plan: '1x por semana - R$ 98,90', is_active: true },
      ];
      window.__athleteWrites = [];
      window.fetch = async (input, options = {}) => {
        const url = new URL(input);
        if (url.pathname.endsWith('/athletes')) {
          if (options.method === 'PATCH') {
            const id = url.searchParams.get('id').replace('eq.', '');
            const athlete = window.__athletes.find(a => a.id === id && a.is_active && a.payment_plan === url.searchParams.get('payment_plan').replace('eq.', ''));
            if (athlete) { athlete.payment_plan = JSON.parse(options.body).payment_plan; window.__athleteWrites.push(id); }
            return new Response(JSON.stringify(athlete ? [{ id }] : []), { status: 200 });
          }
          return new Response(JSON.stringify(window.__athletes.filter(a => a.is_active && ['a', 'b'].includes(a.team_id))), { status: 200 });
        }
        const id = url.searchParams.get('id').replace('eq.', '');
        if (options.method === 'PATCH') {
          window.__dbPlans[id] = JSON.parse(options.body).available_payment_plans;
          window.__writes.push({ id, plans: [...window.__dbPlans[id]] });
          return new Response(JSON.stringify([{ id }]), { status: 200 });
        }
        return new Response(JSON.stringify([{ id, available_payment_plans: window.__dbPlans[id] }]), { status: 200 });
      };
    });
    assert.equal(await page.locator('#pm-catalog .cf-plan-card').count(), 1);
    await page.locator('#pm-monthly').fill('109.90');
    assert.match(await page.locator('#pm-new-preview').innerText(), /R\$ 109,90 - sem taxa de matrícula/);
    await page.getByRole('button', { name: 'Simular reajuste' }).click();
    await page.locator('#pm-reprice-value').fill('109.90');
    await page.locator('#pm-reprice-impact').getByText(/2 atleta\(s\) ativo\(s\)/).waitFor();
    assert.match(await page.locator('#pm-reprice-impact').innerText(), /\+R\$ 11,00 \(\+11,1%\)/);
    assert.match(await page.locator('#pm-reprice-impact').innerText(), /2 atleta\(s\) ativo\(s\)/);
    assert.match(await page.locator('#pm-reprice-impact').innerText(), /\+R\$ 22,00/);
    assert.equal(await page.locator('#pm-reprice-confirm').isDisabled(), true);
    await page.locator('#pm-reprice-ack').check();
    assert.equal(await page.locator('#pm-reprice-confirm').isEnabled(), true);
    await page.locator('#pm-reprice').getByRole('button', { name: 'Cancelar' }).click();

    await page.evaluate(() => {
      window.__dbPlans = {
        a: ['1x por semana - R$ 98,90'],
        b: ['1x por semana - R$ 98,90'],
        c: ['1x por semana - R$ 119,90'],
      };
      window.__writes = [];
    });
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
    await page.locator('#pm-new-teams input[value="b"]').check();
    await page.locator('#pm-create-button').click();
    await page.waitForFunction(() => window.__writes.length >= 2, { timeout: 5000 });
    assert.equal(await page.locator('#pm-create-button').isEnabled(), true);
    const afterCreate = await page.evaluate(() => ({ db: window.__dbPlans, writes: window.__writes.length }));
    assert.equal(afterCreate.writes, 2, dialogs.join(' | '));
    assert.ok(afterCreate.db.a.includes('1x por semana - R$ 109,90 - sem taxa de matrícula'));
    assert.ok(afterCreate.db.b.includes('1x por semana - R$ 109,90 - sem taxa de matrícula'));
    assert.equal(afterCreate.db.c.length, 1);

    await page.getByRole('button', { name: 'Simular reajuste' }).first().click();
    await page.locator('#pm-reprice-value').fill('120.00');
    await page.locator('#pm-reprice-impact').getByText(/2 atleta\(s\) ativo\(s\)/).waitFor();
    assert.equal((await page.evaluate(() => window.__writes)).length, 2, 'simular não grava no banco');
    await page.locator('#pm-reprice-ack').check();
    await page.evaluate(() => { window.confirm = () => false; });
    await page.locator('#pm-reprice-confirm').click();
    assert.equal((await page.evaluate(() => window.__writes)).length, 2, 'cancelar confirmação não grava no banco');
    await page.evaluate(() => { window.confirm = () => true; });
    await page.locator('#pm-reprice-confirm').click();
    await page.waitForFunction(() => window.__athleteWrites.length >= 2, { timeout: 5000 });
    const afterReprice = await page.evaluate(() => ({ db: window.__dbPlans, writes: window.__writes.length }));
    assert.equal(afterReprice.writes, 4);
    assert.ok(afterReprice.db.a.includes('1x por semana - R$ 120,00 - sem taxa de matrícula'));
    assert.ok(afterReprice.db.b.includes('1x por semana - R$ 120,00 - sem taxa de matrícula'));
    assert.equal(afterReprice.db.c.length, 1);
    assert.deepEqual(await page.evaluate(() => window.__athletes.map(a => a.payment_plan)), [
      '1x por semana - R$ 120,00 - sem taxa de matrícula',
      '1x por semana - R$ 120,00 - sem taxa de matrícula',
      '1x por semana - R$ 98,90',
      '1x por semana - R$ 98,90',
    ]);
    await page.locator('#pm-catalog .cf-plan-card').filter({ hasText: 'R$ 120,00' }).getByRole('button', { name: 'Simular reajuste' }).click();
    await page.locator('#pm-reprice-value').fill('130.00');
    await page.locator('#pm-reprice-impact').getByText(/2 atleta\(s\) ativo\(s\)/).waitFor();
    await page.locator('#pm-reprice-ack').check();
    await page.evaluate(() => window.__athletes.push({ id: 'a2', team_id: 'a', payment_plan: '1x por semana - R$ 120,00 - sem taxa de matrícula', is_active: true }));
    const conflictDialog = page.waitForEvent('dialog');
    await page.locator('#pm-reprice-confirm').click();
    assert.match((await conflictDialog).message(), /Simule novamente antes de reajustar/);
    assert.equal((await page.evaluate(() => window.__writes)).length, 4, 'mudança na lista de atletas impede a gravação');
  } finally {
    await browser.close();
  }
});
