package com.edutrack.service;

import com.edutrack.exception.BadRequestException;
import com.edutrack.exception.ResourceNotFoundException;
import com.edutrack.model.Assignment;
import com.edutrack.model.dto.AssignmentRequest;
import com.edutrack.repository.AssignmentJdbcRepository;
import com.edutrack.repository.SubjectJdbcRepository;
import com.edutrack.repository.UserJdbcRepository;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class AssignmentService {

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList(".pdf", ".doc", ".docx");

    private final AssignmentJdbcRepository assignmentRepository;
    private final SubjectJdbcRepository subjectRepository;
    private final UserJdbcRepository userRepository;

    public AssignmentService(AssignmentJdbcRepository assignmentRepository,
                             SubjectJdbcRepository subjectRepository,
                             UserJdbcRepository userRepository) {
        this.assignmentRepository = assignmentRepository;
        this.subjectRepository = subjectRepository;
        this.userRepository = userRepository;
    }

    public List<Assignment> getAssignmentsForStudent(String studentId) {
        if (!userRepository.existsByStudentId(studentId)) {
            throw new ResourceNotFoundException("Student not found with ID: " + studentId);
        }
        return assignmentRepository.findAllForStudent(studentId);
    }

    public List<Assignment> getAllAssignments() {
        return assignmentRepository.findAll();
    }

    public Assignment createAssignment(AssignmentRequest req, String adminId) {
        if (subjectRepository.findById(req.getSubjectId()).isEmpty()) {
            throw new ResourceNotFoundException("Subject not found with ID: " + req.getSubjectId());
        }

        Assignment assignment = new Assignment();
        assignment.setTitle(req.getTitle().trim());
        assignment.setSubjectId(req.getSubjectId());
        assignment.setDescription(req.getDescription() != null ? req.getDescription().trim() : "");
        assignment.setDueDate(req.getDueDate());
        assignment.setCreatedBy(adminId);

        return assignmentRepository.createAssignment(assignment);
    }

    public void updateAssignment(Long id, AssignmentRequest req) {
        if (assignmentRepository.findById(id).isEmpty()) {
            throw new ResourceNotFoundException("Assignment not found with ID: " + id);
        }
        if (subjectRepository.findById(req.getSubjectId()).isEmpty()) {
            throw new ResourceNotFoundException("Subject not found with ID: " + req.getSubjectId());
        }

        Assignment assignment = new Assignment();
        assignment.setTitle(req.getTitle().trim());
        assignment.setSubjectId(req.getSubjectId());
        assignment.setDescription(req.getDescription() != null ? req.getDescription().trim() : "");
        assignment.setDueDate(req.getDueDate());

        boolean ok = assignmentRepository.updateAssignment(id, assignment);
        if (!ok) {
            throw new RuntimeException("Failed to update assignment " + id);
        }
    }

    public void deleteAssignment(Long id) {
        if (assignmentRepository.findById(id).isEmpty()) {
            throw new ResourceNotFoundException("Assignment not found with ID: " + id);
        }
        boolean ok = assignmentRepository.deleteAssignment(id);
        if (!ok) {
            throw new RuntimeException("Failed to delete assignment " + id);
        }
    }

    public void updateStatus(Long id, String studentId, String status) {
        if (assignmentRepository.findById(id).isEmpty()) {
            throw new ResourceNotFoundException("Assignment not found with ID: " + id);
        }
        if (!userRepository.existsByStudentId(studentId)) {
            throw new ResourceNotFoundException("Student not found with ID: " + studentId);
        }
        if (!"PENDING".equalsIgnoreCase(status) && !"COMPLETED".equalsIgnoreCase(status)) {
            throw new BadRequestException("Status must be either 'PENDING' or 'COMPLETED'");
        }

        assignmentRepository.updateStudentStatus(id, studentId, status);
    }

    public Assignment submitAssignment(Long assignmentId, String studentId, MultipartFile file, String notes) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Assignment not found with ID: " + assignmentId));

        if (!userRepository.existsByStudentId(studentId)) {
            throw new ResourceNotFoundException("Student not found with ID: " + studentId);
        }

        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Please select a file to upload.");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BadRequestException("File size exceeds maximum allowable limit of 10 MB.");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || originalFilename.trim().isEmpty()) {
            throw new BadRequestException("Uploaded file name is invalid.");
        }

        // Sanitize filename to prevent path traversal
        String cleanName = Paths.get(originalFilename).getFileName().toString();
        String lowerName = cleanName.toLowerCase();

        String matchedExt = null;
        for (String ext : ALLOWED_EXTENSIONS) {
            if (lowerName.endsWith(ext)) {
                matchedExt = ext;
                break;
            }
        }

        if (matchedExt == null) {
            throw new BadRequestException("Unsupported file type. Only PDF, DOC, and DOCX files are allowed.");
        }

        // Validate file content magic bytes
        validateFileMagicBytes(file, matchedExt);

        // Determine submission status based on deadline
        String status = "SUBMITTED";
        if (assignment.getDueDate() != null && LocalDate.now().isAfter(assignment.getDueDate())) {
            status = "LATE";
        }

        try {
            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads", "assignments");
            if (!Files.exists(uploadDir)) {
                Files.createDirectories(uploadDir);
            }

            // Generate unique secure storage filename to avoid collision or execution
            String safeBaseName = cleanName.replaceAll("[^a-zA-Z0-9.-]", "_");
            String storedFilename = UUID.randomUUID().toString() + "_" + safeBaseName;
            Path targetPath = uploadDir.resolve(storedFilename);

            Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);

            Timestamp submittedAt = Timestamp.valueOf(LocalDateTime.now());
            assignmentRepository.saveSubmission(assignmentId, studentId, cleanName, storedFilename,
                    file.getSize(), notes, status, submittedAt);

            return assignmentRepository.findSubmission(assignmentId, studentId)
                    .orElse(assignment);
        } catch (IOException e) {
            throw new RuntimeException("Failed to securely store uploaded assignment file: " + e.getMessage(), e);
        }
    }

    public Resource getSubmissionFileResource(Long assignmentId, String studentId) {
        Assignment submission = assignmentRepository.findSubmission(assignmentId, studentId)
                .orElseThrow(() -> new ResourceNotFoundException("No submission record found for assignment " + assignmentId));

        if (submission.getStoredFilename() == null) {
            throw new ResourceNotFoundException("No uploaded file associated with this submission.");
        }

        try {
            Path filePath = Paths.get(System.getProperty("user.dir"), "uploads", "assignments", submission.getStoredFilename());
            if (!Files.exists(filePath) || !Files.isReadable(filePath)) {
                throw new ResourceNotFoundException("Submitted file is not accessible on the server.");
            }
            return new UrlResource(filePath.toUri());
        } catch (Exception e) {
            throw new RuntimeException("Error accessing submitted file: " + e.getMessage(), e);
        }
    }

    public Assignment getSubmissionDetails(Long assignmentId, String studentId) {
        return assignmentRepository.findSubmission(assignmentId, studentId)
                .orElseThrow(() -> new ResourceNotFoundException("No submission found for assignment " + assignmentId));
    }

    public List<Assignment> getSubmissionsForAssignment(Long assignmentId) {
        if (assignmentRepository.findById(assignmentId).isEmpty()) {
            throw new ResourceNotFoundException("Assignment not found with ID: " + assignmentId);
        }
        return assignmentRepository.findSubmissionsByAssignment(assignmentId);
    }

    private void validateFileMagicBytes(MultipartFile file, String ext) {
        byte[] header = new byte[8];
        try (InputStream is = file.getInputStream()) {
            int read = is.read(header);
            if (read < 4) {
                throw new BadRequestException("Uploaded file is corrupted or too small.");
            }
        } catch (IOException e) {
            throw new BadRequestException("Could not read uploaded file content for validation.");
        }

        // PDF: %PDF (0x25, 0x50, 0x44, 0x46)
        if (".pdf".equals(ext)) {
            if (header[0] != 0x25 || header[1] != 0x50 || header[2] != 0x44 || header[3] != 0x46) {
                throw new BadRequestException("File content signature does not match a valid PDF document.");
            }
        }
        // DOCX: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
        else if (".docx".equals(ext)) {
            if (header[0] != 0x50 || header[1] != 0x4B || header[2] != 0x03 || header[3] != 0x04) {
                throw new BadRequestException("File content signature does not match a valid DOCX document.");
            }
        }
        // DOC: OLE2 compound document (0xD0, 0xCF, 0x11, 0xE0) or Word template
        else if (".doc".equals(ext)) {
            boolean isOle2 = (header[0] == (byte) 0xD0 && header[1] == (byte) 0xCF &&
                              header[2] == (byte) 0x11 && header[3] == (byte) 0xE0);
            boolean isZip = (header[0] == 0x50 && header[1] == 0x4B);
            if (!isOle2 && !isZip) {
                throw new BadRequestException("File content signature does not match a valid Word document.");
            }
        }
    }
}
