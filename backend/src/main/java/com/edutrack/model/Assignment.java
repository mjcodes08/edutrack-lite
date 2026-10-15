package com.edutrack.model;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class Assignment {
    private Long id;
    private String title;
    private Long subjectId;
    private String subjectCode;
    private String subjectName;
    private String description;
    private LocalDate dueDate;
    private String status; // "PENDING", "COMPLETED", "OVERDUE", "SUBMITTED", "LATE"
    private String createdBy;
    private LocalDateTime createdAt;

    // Student submission metadata
    private String submittedFilename;
    private String storedFilename;
    private Long fileSize;
    private String submissionNotes;
    private LocalDateTime submittedAt;
    private String studentId;
    private String studentName;

    public Assignment() {}

    public Assignment(Long id, String title, Long subjectId, String subjectCode, String subjectName,
                      String description, LocalDate dueDate, String status, String createdBy, LocalDateTime createdAt) {
        this.id = id;
        this.title = title;
        this.subjectId = subjectId;
        this.subjectCode = subjectCode;
        this.subjectName = subjectName;
        this.description = description;
        this.dueDate = dueDate;
        this.status = status;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Long getSubjectId() { return subjectId; }
    public void setSubjectId(Long subjectId) { this.subjectId = subjectId; }

    public String getSubjectCode() { return subjectCode; }
    public void setSubjectCode(String subjectCode) { this.subjectCode = subjectCode; }

    public String getSubjectName() { return subjectName; }
    public void setSubjectName(String subjectName) { this.subjectName = subjectName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public String getStatus() {
        // Dynamic overdue detection: only if pending and due date is past today
        if ("PENDING".equalsIgnoreCase(status) && dueDate != null && dueDate.isBefore(LocalDate.now())) {
            return "OVERDUE";
        }
        return status != null ? status : "PENDING";
    }

    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getSubmittedFilename() { return submittedFilename; }
    public void setSubmittedFilename(String submittedFilename) { this.submittedFilename = submittedFilename; }

    public String getStoredFilename() { return storedFilename; }
    public void setStoredFilename(String storedFilename) { this.storedFilename = storedFilename; }

    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }

    public String getSubmissionNotes() { return submissionNotes; }
    public void setSubmissionNotes(String submissionNotes) { this.submissionNotes = submissionNotes; }

    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }

    public String getStudentId() { return studentId; }
    public void setStudentId(String studentId) { this.studentId = studentId; }

    public String getStudentName() { return studentName; }
    public void setStudentName(String studentName) { this.studentName = studentName; }
}
