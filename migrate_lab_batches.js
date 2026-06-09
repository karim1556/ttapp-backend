'use strict';
/**
 * Migration: Split lab subjects into per-batch records with different faculty.
 * This enables simultaneous batch scheduling (all 3 batches at same time, different rooms).
 */
const prisma = require('./src/config/prisma');

const BRANCH_ID = 1;
const SEMESTER = 4;
const LAB_BATCHES = ['A', 'B', 'C'];

// Faculty assignments for each batch of each lab subject
// Format: subject_code -> [faculty_for_A, faculty_for_B, faculty_for_C]
const FACULTY_MAP = {
  'CS4-LAB-DBMS': [44, 45, 46],
  'CS4-LAB-OS':    [47, 48, 49],
  'CS4-LAB-CN':    [50, 51, 52],
  'Mini':          [53, 54, 31],
  'bmd':           [32, 33, 34],
  'design thinkin': [35, 36, 37],
};

// Subject names for each batch
const NAME_MAP = {
  'CS4-LAB-DBMS': 'DBMS Laboratory',
  'CS4-LAB-OS':    'OS Laboratory',
  'CS4-LAB-CN':    'CN Laboratory',
  'Mini':          'Mini Project IB',
  'bmd':           'BMD Laboratory',
  'design thinkin': 'Design Thinking Lab',
};

async function main() {
  console.log('=== Lab Batch Migration ===\n');

  // Step 1: Add batch column if not exists
  try {
    await prisma.$executeRaw`ALTER TABLE subjects ADD COLUMN batch VARCHAR(10) DEFAULT NULL`;
    console.log('Added batch column to subjects table.');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('batch column already exists.');
    } else {
      console.log('batch column note:', e.message);
    }
  }

  // Step 2: Find all lab subjects for this branch/semester
  const labSubjects = await prisma.subject.findMany({
    where: {
      branch_id: BRANCH_ID,
      semester: SEMESTER,
      ispractical: 'Yes',
    },
  });

  console.log(`Found ${labSubjects.length} lab subjects.`);

  // Step 3: For each lab subject, create 3 batch variants
  for (const subj of labSubjects) {
    const code = subj.subject_code;
    const facultyIds = FACULTY_MAP[code];
    const name = NAME_MAP[code] || subj.subject_name;

    if (!facultyIds) {
      console.log(`  SKIP: ${code} — no faculty mapping defined.`);
      continue;
    }

    console.log(`\n  Processing: ${code} (current prof=${subj.professor_assign})`);

    // Delete the original (non-batch) record
    await prisma.subject.delete({ where: { id: subj.id } });
    console.log(`    Deleted original record (id=${subj.id}).`);

    // Create 3 batch variants
    for (let i = 0; i < LAB_BATCHES.length; i++) {
      const batch = LAB_BATCHES[i];
      const facultyId = facultyIds[i];
      const batchCode = `${code}-${batch}`;

      // Check if already exists
      const existing = await prisma.subject.findFirst({
        where: {
          branch_id: BRANCH_ID,
          semester: SEMESTER,
          subject_code: batchCode,
          batch: batch,
        },
      });

      if (existing) {
        console.log(`    Batch ${batch}: already exists (id=${existing.id}), skipping.`);
        continue;
      }

      const newSubj = await prisma.subject.create({
        data: {
          subject_code: batchCode,
          subject_name: `${name} [Batch ${batch}]`,
          semester: SEMESTER,
          branch_id: BRANCH_ID,
          acad_year: subj.acad_year || '2025-26',
          weekly_hours: subj.weekly_hours,
          semester_hours: subj.semester_hours,
          experiments: subj.experiments,
          num_experiments: subj.num_experiments,
          num_assignments: subj.num_assignments,
          theory: subj.theory,
          num_modules: subj.num_modules,
          professor_assign: String(facultyId),
          totalcredits: subj.totalcredits,
          max_marks: subj.max_marks || 100,
          isoral: subj.isoral || 'No',
          ispractical: 'Yes',
          oral_marks: subj.oral_marks || 0,
          practical_marks: subj.practical_marks || 0,
          passing_marks: subj.passing_marks || 40,
          batch: batch,
        },
      });

      console.log(`    Batch ${batch}: created (id=${newSubj.id}, code=${batchCode}, prof=${facultyId}).`);
    }
  }

  // Step 4: Also add batch column to theory subjects (set to NULL for non-batched)
  const theorySubjects = await prisma.subject.findMany({
    where: {
      branch_id: BRANCH_ID,
      semester: SEMESTER,
      ispractical: 'No',
    },
  });

  for (const subj of theorySubjects) {
    if (!subj.batch) {
      await prisma.subject.update({
        where: { id: subj.id },
        data: { batch: null },
      });
    }
  }

  console.log('\n=== Migration complete! ===');
  console.log('Now restart your backend and regenerate the timetable.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());