-- CreateTable
CREATE TABLE `users` (
    `uid` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NULL,
    `user_type` INTEGER NULL,
    `password` VARCHAR(255) NULL,

    PRIMARY KEY (`uid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faculty` (
    `faculty_id` INTEGER NOT NULL AUTO_INCREMENT,
    `uid` INTEGER NULL,
    `faculty_clg_id` VARCHAR(100) NULL,
    `name` VARCHAR(255) NULL,
    `contact` VARCHAR(11) NULL,
    `ftype_id` INTEGER NULL,
    `role` VARCHAR(150) NULL,
    `depart_id` INTEGER NULL,
    `previlage` INTEGER NULL,
    `joining_date` DATE NULL,
    `shift_id` INTEGER NULL,
    `gender` VARCHAR(20) NULL,
    `dob` DATE NULL,
    `qualification` VARCHAR(255) NULL,
    `pan_no` VARCHAR(50) NULL,
    `aadhar_card` VARCHAR(50) NULL,
    `blood_group` VARCHAR(5) NULL,
    `permanent_address` TEXT NULL,
    `current_address` TEXT NULL,
    `alternate_mobile` VARCHAR(15) NULL,
    `experience_details` TEXT NULL,
    `photo` TEXT NULL,
    `signature` TEXT NULL,
    `cv` TEXT NULL,
    `email` VARCHAR(255) NULL,
    `branch_id` INTEGER NULL,
    `weekly_work_hours` INTEGER NULL DEFAULT 18,
    `status` TINYINT NULL DEFAULT 1,

    PRIMARY KEY (`faculty_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subjects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject_code` VARCHAR(200) NOT NULL,
    `subject_name` VARCHAR(255) NULL,
    `semester` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `acad_year` VARCHAR(100) NULL,
    `weekly_hours` INTEGER NULL,
    `semester_hours` INTEGER NULL,
    `experiments` TEXT NULL,
    `num_experiments` INTEGER NULL,
    `num_assignments` INTEGER NULL,
    `theory` TEXT NULL,
    `num_modules` INTEGER NULL,
    `professor_assign` VARCHAR(255) NULL,
    `totalcredits` DOUBLE NULL,
    `max_marks` INTEGER NULL DEFAULT 0,
    `isoral` VARCHAR(20) NULL DEFAULT 'No',
    `ispractical` VARCHAR(20) NULL DEFAULT 'No',
    `oral_marks` INTEGER NULL DEFAULT 0,
    `practical_marks` INTEGER NULL DEFAULT 0,
    `passing_marks` INTEGER NULL,
    `batch` VARCHAR(10) NULL,
    `division` VARCHAR(10) NULL,
    `preferred_room` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tbl_time_table` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `dateOfWeek` ENUM('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NULL,
    `fromDate` DATETIME(3) NULL,
    `toDate` DATETIME(3) NULL,
    `branch_id` INTEGER NULL,
    `sem` VARCHAR(2) NULL,
    `division` VARCHAR(2) NULL,
    `academic_id` INTEGER NULL,
    `createdBy` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `time_time_detailed` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `timetable_id` BIGINT NULL,
    `startTimeHr` INTEGER NULL,
    `startTimeMinutes` INTEGER NULL,
    `endTimeHr` INTEGER NULL,
    `endTimeMinutes` INTEGER NULL,
    `createdBy` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `time_time_detailed_timetable_id_fkey`(`timetable_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `time_table_batch_subject` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `time_table_detailed_id` BIGINT NULL,
    `typeOfLecture` ENUM('Lecture', 'Lab') NULL,
    `subjectCode` VARCHAR(100) NULL,
    `facultyid` BIGINT NULL,
    `batch` VARCHAR(2) NULL,
    `createdBy` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `is_extra` INTEGER NULL DEFAULT 0,
    `lect_on_dehalf` BIGINT NULL,
    `reason` VARCHAR(1000) NULL,
    `room_number` VARCHAR(10) NULL,

    INDEX `time_table_batch_subject_time_table_detailed_id_fkey`(`time_table_detailed_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `copo_user_course` (
    `usercourse_id` INTEGER NOT NULL AUTO_INCREMENT,
    `course_id` INTEGER NULL,
    `semester` INTEGER NULL,
    `academic_year` VARCHAR(255) NULL,
    `branch` INTEGER NULL,
    `co_count` INTEGER NULL,
    `created_at` DATETIME(3) NULL,

    PRIMARY KEY (`usercourse_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `copo_usercourse_users` (
    `id_usercourse_users` INTEGER NOT NULL AUTO_INCREMENT,
    `usercourse_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,

    PRIMARY KEY (`id_usercourse_users`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(50) NULL DEFAULT 'National',
    `description` TEXT NULL,
    `academic_year` VARCHAR(10) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faculty_constraints` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `faculty_id` INTEGER NOT NULL,
    `max_lectures_per_day` INTEGER NOT NULL DEFAULT 4,
    `total_lectures_per_week` INTEGER NOT NULL DEFAULT 16,
    `unavailable_slots` JSON NULL,
    `preferred_slots` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `faculty_constraints_faculty_id_key`(`faculty_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fcm_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fcm_tokens_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `substitutions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `lecture_id` BIGINT NOT NULL,
    `slot_id` BIGINT NOT NULL,
    `date` DATE NOT NULL,
    `day_name` VARCHAR(20) NULL,
    `original_faculty_id` INTEGER NULL,
    `original_faculty_name` VARCHAR(255) NULL,
    `substitute_faculty_id` INTEGER NOT NULL,
    `substitute_faculty_name` VARCHAR(255) NULL,
    `subject_code` VARCHAR(100) NULL,
    `subject_name` VARCHAR(255) NULL,
    `room_number` VARCHAR(20) NULL,
    `batch` VARCHAR(10) NULL,
    `lecture_type` VARCHAR(50) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `reason` VARCHAR(1000) NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `temporary_only` TINYINT NOT NULL DEFAULT 1,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_substitutions_date`(`date`),
    INDEX `idx_substitutions_status`(`status`),
    INDEX `idx_substitutions_original_faculty`(`original_faculty_id`),
    INDEX `idx_substitutions_substitute_faculty`(`substitute_faculty_id`),
    UNIQUE INDEX `uq_substitutions_lecture_date`(`lecture_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `room_number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NULL,
    `capacity` INTEGER NULL,
    `room_type` VARCHAR(30) NULL DEFAULT 'Classroom',
    `branch_id` INTEGER NULL,
    `floor` VARCHAR(10) NULL,
    `is_active` TINYINT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `time_slot_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NULL,
    `semester` INTEGER NULL,
    `division` VARCHAR(10) NULL,
    `label` VARCHAR(50) NULL,
    `startTimeHr` INTEGER NOT NULL,
    `startTimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `endTimeHr` INTEGER NOT NULL,
    `endTimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `is_break` TINYINT NULL DEFAULT 0,
    `sort_order` INTEGER NULL DEFAULT 0,
    `is_active` TINYINT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_lab_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `semester` INTEGER NOT NULL,
    `division` VARCHAR(10) NOT NULL,
    `lab_slot_index` INTEGER NOT NULL DEFAULT 6,
    `batch_split_slot_index` INTEGER NOT NULL DEFAULT 3,
    `batch_split_enabled` TINYINT NOT NULL DEFAULT 1,
    `lab_duration_slots` INTEGER NOT NULL DEFAULT 2,
    `home_room` VARCHAR(20) NULL,
    `academic_year` VARCHAR(10) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `class_lab_slots_branch_id_semester_division_academic_year_key`(`branch_id`, `semester`, `division`, `academic_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `temporary_timetable` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `semester` INTEGER NOT NULL,
    `division` VARCHAR(10) NOT NULL,
    `date` DATE NOT NULL,
    `startTimeHr` INTEGER NOT NULL,
    `startTimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `endTimeHr` INTEGER NOT NULL,
    `endTimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `subjectCode` VARCHAR(100) NULL,
    `facultyid` BIGINT NULL,
    `room_number` VARCHAR(20) NULL,
    `typeOfLecture` VARCHAR(50) NULL DEFAULT 'Lecture',
    `eventName` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `createdBy` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `time_time_detailed` ADD CONSTRAINT `time_time_detailed_timetable_id_fkey` FOREIGN KEY (`timetable_id`) REFERENCES `tbl_time_table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `time_table_batch_subject` ADD CONSTRAINT `time_table_batch_subject_time_table_detailed_id_fkey` FOREIGN KEY (`time_table_detailed_id`) REFERENCES `time_time_detailed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faculty_constraints` ADD CONSTRAINT `faculty_constraints_faculty_id_fkey` FOREIGN KEY (`faculty_id`) REFERENCES `faculty`(`faculty_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

