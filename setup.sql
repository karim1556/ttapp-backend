-- ============================================================
-- ADDITIONAL TABLES REQUIRED BY THE APP
-- Run this AFTER your existing schema is already in place
-- ============================================================

CREATE TABLE IF NOT EXISTS `holidays` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `date`          DATE NOT NULL,
  `name`          VARCHAR(255) NOT NULL,
  `type`          VARCHAR(50) DEFAULT 'National',  -- National | Institute | Festival
  `description`   TEXT,
  `academic_year` VARCHAR(10) DEFAULT NULL,
  `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `faculty_constraints` (
  `id`                       INT NOT NULL AUTO_INCREMENT,
  `faculty_id`               INT NOT NULL,
  `max_lectures_per_day`     INT DEFAULT 4,
  `total_lectures_per_week`  INT DEFAULT 16,
  `unavailable_slots`        JSON DEFAULT NULL,
  `preferred_slots`          JSON DEFAULT NULL,
  `created_at`               DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_faculty_constraints` (`faculty_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fcm_tokens` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `user_id`    INT NOT NULL,
  `token`      TEXT NOT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fcm_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `substitutions` (
  `id`                      BIGINT NOT NULL AUTO_INCREMENT,
  `lecture_id`              BIGINT NOT NULL,
  `slot_id`                 BIGINT NOT NULL,
  `date`                    DATE NOT NULL,
  `day_name`                VARCHAR(20) DEFAULT NULL,
  `original_faculty_id`     INT DEFAULT NULL,
  `original_faculty_name`   VARCHAR(255) DEFAULT NULL,
  `substitute_faculty_id`   INT NOT NULL,
  `substitute_faculty_name` VARCHAR(255) DEFAULT NULL,
  `subject_code`            VARCHAR(100) DEFAULT NULL,
  `subject_name`            VARCHAR(255) DEFAULT NULL,
  `room_number`             VARCHAR(20) DEFAULT NULL,
  `batch`                   VARCHAR(10) DEFAULT NULL,
  `lecture_type`            VARCHAR(50) DEFAULT NULL,
  `status`                  VARCHAR(30) NOT NULL DEFAULT 'pending',
  `reason`                  VARCHAR(1000) DEFAULT NULL,
  `approved_by`             INT DEFAULT NULL,
  `approved_at`             DATETIME DEFAULT NULL,
  `temporary_only`          TINYINT NOT NULL DEFAULT 1,
  `created_by`              INT DEFAULT NULL,
  `created_at`              DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_substitutions_lecture_date` (`lecture_id`, `date`),
  KEY `idx_substitutions_date` (`date`),
  KEY `idx_substitutions_status` (`status`),
  KEY `idx_substitutions_original_faculty` (`original_faculty_id`),
  KEY `idx_substitutions_substitute_faculty` (`substitute_faculty_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SEED: default admin user  (password: admin123)
-- bcrypt hash of "admin123" with 10 rounds
-- ============================================================
INSERT IGNORE INTO `users` (`email`, `user_type`, `password`) VALUES
('admin@ttapp.com', 1, '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
