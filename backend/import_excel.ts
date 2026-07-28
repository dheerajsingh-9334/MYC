import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organisation.findFirst();
  if (!org) throw new Error("Organisation not found. Run seed.ts first.");
  
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin) throw new Error("Admin not found.");

  const steps = await prisma.step.findMany({ where: { organisationId: org.id }, orderBy: { stepNumber: 'asc' } });
  const stepMap = new Map(steps.map(s => [s.stepNumber, s]));

  const workbook = xlsx.readFile('/home/dheerajsingh/Desktop/MYC/Development Copy of MyC Client Status.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel.`);

  let imported = 0;
  for (const row of rows) {
    const name = row['Clients Name'];
    if (!name || name.trim() === '') continue;

    let email = row['Email'];
    if (!email) {
      email = `${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}_${Math.floor(Math.random()*1000)}@example.com`;
    }

    const phone = row['Phone'] ? String(row['Phone']) : undefined;
    
    // Determine Step based on Excel columns
    let stepNumber = 1;
    if (row['Funnel Launched'] === 'Done' || row['WON']) stepNumber = 9;
    else if (row['Ads Launch'] === 'Done') stepNumber = 7;
    else if (row['Ad Creatives'] === 'Done' || row['Client Videos'] === 'Done') stepNumber = 6;
    else if (row['LP Design'] === 'Done') stepNumber = 5;
    else if (row['LP Content'] === 'Done') stepNumber = 4;
    else if (row['Offer'] === 'Done') stepNumber = 3;
    else if (row['CRM Setup'] === 'Done') stepNumber = 2;

    const step = stepMap.get(stepNumber);
    if (!step) continue;

    // Check if client exists
    const existing = await prisma.client.findFirst({ where: { organisationId: org.id, email } });
    if (existing) continue;

    let dateJoined = new Date();
    if (row['Onboarding Date']) {
      // Excel date parsing (roughly)
      if (typeof row['Onboarding Date'] === 'number') {
        dateJoined = new Date(Math.round((row['Onboarding Date'] - 25569) * 86400 * 1000));
      } else {
        dateJoined = new Date(row['Onboarding Date']);
      }
    }

    const isCompleted = row['WON'] ? true : false;

    const client = await prisma.client.create({
      data: {
        organisationId: org.id,
        fullName: name,
        brandName: name,
        email,
        whatsappNumber: phone,
        currentStepId: step.id,
        status: isCompleted ? 'completed' : 'active',
        dateJoined: dateJoined,
        stepEnteredAt: new Date(),
        createdById: admin.id,
      }
    });

    // Create history
    await prisma.stepHistory.create({
      data: {
        organisationId: org.id,
        clientId: client.id,
        toStepId: step.id,
        triggeredBy: 'admin',
        triggeredByUserId: admin.id,
        reasonNote: 'Imported from Excel',
      }
    });

    // Create tasks for current step
    const templates = await prisma.stepTaskTemplate.findMany({ where: { stepId: step.id } });
    const teamMem = await prisma.user.findFirst({ where: { teamName: step.owningTeamName } });
    const assigneeId = teamMem ? teamMem.id : admin.id;

    for (const t of templates) {
      await prisma.task.create({
        data: {
          organisationId: org.id,
          clientId: client.id,
          stepId: step.id,
          templateTaskId: t.id,
          assignedToId: assigneeId,
          title: t.title,
          priority: t.priority,
          dueDate: new Date(Date.now() + t.relativeDueDay * 86400000),
          status: 'pending',
        }
      });
    }
    imported++;
  }

  console.log(`Successfully imported ${imported} clients.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
