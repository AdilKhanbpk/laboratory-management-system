-- Migration: 005_who_catalog_standards.sql
-- Description: Add WHO laboratory quality standard fields to lab_tests: sample_type, collection_container, patient_preparation, turnaround_time, test_method

ALTER TABLE lab_tests ADD COLUMN sample_type TEXT;
ALTER TABLE lab_tests ADD COLUMN collection_container TEXT;
ALTER TABLE lab_tests ADD COLUMN patient_preparation TEXT;
ALTER TABLE lab_tests ADD COLUMN turnaround_time TEXT;
ALTER TABLE lab_tests ADD COLUMN test_method TEXT;

