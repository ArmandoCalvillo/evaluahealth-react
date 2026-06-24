import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://localhost:5273/', { waitUntil: 'networkidle' });
await p.fill('input[type=email]', 'admin@evaluahealth.mx');
await p.fill('input[type=password]', 'Admin@123');
await p.click('button[type=submit]');
await p.waitForTimeout(3500);

// Students page — capture immediately to catch any flash
await p.goto('http://localhost:5273/admin/students', { waitUntil: 'commit' });
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/students_early.png' });
await p.waitForTimeout(3000);
await p.screenshot({ path: '/tmp/students_loaded.png' });

// Locations — open Add drawer
await p.goto('http://localhost:5273/admin/locations', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/locations_list.png' });
const addBtn = p.locator('button:has-text("Add Location")').first();
await addBtn.click();
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/locations_add.png' });
await b.close();
console.log('done');
