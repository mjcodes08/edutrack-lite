package com.edutrack.repository;

import com.edutrack.model.Assignment;
import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class AssignmentJdbcRepository {

    private final DataSource dataSource;

    public AssignmentJdbcRepository(DataSource dataSource) {
        this.dataSource = dataSource;
        ensureSubmissionColumnsExist();
    }

    private void ensureSubmissionColumnsExist() {
        try (Connection conn = dataSource.getConnection()) {
            boolean hasCol = false;
            try (ResultSet rs = conn.getMetaData().getColumns(null, null, "STUDENT_ASSIGNMENTS", "SUBMITTED_FILENAME")) {
                if (rs.next()) hasCol = true;
            }
            if (!hasCol) {
                try (ResultSet rs = conn.getMetaData().getColumns(null, null, "student_assignments", "submitted_filename")) {
                    if (rs.next()) hasCol = true;
                }
            }
            if (!hasCol) {
                try (java.sql.Statement stmt = conn.createStatement()) {
                    stmt.executeUpdate("ALTER TABLE student_assignments ADD COLUMN submitted_filename VARCHAR(255)");
                    stmt.executeUpdate("ALTER TABLE student_assignments ADD COLUMN stored_filename VARCHAR(255)");
                    stmt.executeUpdate("ALTER TABLE student_assignments ADD COLUMN file_size BIGINT DEFAULT 0");
                    stmt.executeUpdate("ALTER TABLE student_assignments ADD COLUMN submission_notes TEXT");
                    stmt.executeUpdate("ALTER TABLE student_assignments ADD COLUMN submitted_at TIMESTAMP NULL");
                } catch (SQLException ignored) {
                    // Columns might already exist
                }
            }
        } catch (SQLException e) {
            // Non-fatal
        }
    }

    public List<Assignment> findAllForStudent(String studentId) {
        List<Assignment> list = new ArrayList<>();
        String sql = "SELECT a.id, a.title, a.subject_id, s.code AS subject_code, s.name AS subject_name, " +
                     "a.description, a.due_date, COALESCE(sa.status, 'PENDING') AS status, a.created_by, a.created_at, " +
                     "sa.submitted_filename, sa.stored_filename, sa.file_size, sa.submission_notes, sa.submitted_at " +
                     "FROM assignments a " +
                     "JOIN subjects s ON a.subject_id = s.id " +
                     "LEFT JOIN student_assignments sa ON a.id = sa.assignment_id AND sa.student_id = ? " +
                     "ORDER BY a.due_date ASC, a.id DESC";

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, studentId.trim());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    list.add(mapRowToAssignment(rs, true, true));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error loading assignments for student " + studentId + ": " + e.getMessage(), e);
        }
        return list;
    }

    public List<Assignment> findAll() {
        List<Assignment> list = new ArrayList<>();
        String sql = "SELECT a.id, a.title, a.subject_id, s.code AS subject_code, s.name AS subject_name, " +
                     "a.description, a.due_date, 'PENDING' AS status, a.created_by, a.created_at " +
                     "FROM assignments a " +
                     "JOIN subjects s ON a.subject_id = s.id " +
                     "ORDER BY a.due_date ASC, a.id DESC";

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                list.add(mapRowToAssignment(rs, false, false));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error loading all assignments: " + e.getMessage(), e);
        }
        return list;
    }

    public Optional<Assignment> findById(Long id) {
        String sql = "SELECT a.id, a.title, a.subject_id, s.code AS subject_code, s.name AS subject_name, " +
                     "a.description, a.due_date, 'PENDING' AS status, a.created_by, a.created_at " +
                     "FROM assignments a " +
                     "JOIN subjects s ON a.subject_id = s.id " +
                     "WHERE a.id = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRowToAssignment(rs, false, false));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error loading assignment " + id + ": " + e.getMessage(), e);
        }
        return Optional.empty();
    }

    public Optional<Assignment> findSubmission(Long assignmentId, String studentId) {
        String sql = "SELECT a.id, a.title, a.subject_id, s.code AS subject_code, s.name AS subject_name, " +
                     "a.description, a.due_date, COALESCE(sa.status, 'PENDING') AS status, a.created_by, a.created_at, " +
                     "sa.submitted_filename, sa.stored_filename, sa.file_size, sa.submission_notes, sa.submitted_at " +
                     "FROM student_assignments sa " +
                     "JOIN assignments a ON sa.assignment_id = a.id " +
                     "JOIN subjects s ON a.subject_id = s.id " +
                     "WHERE sa.assignment_id = ? AND sa.student_id = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, assignmentId);
            ps.setString(2, studentId.trim());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapRowToAssignment(rs, true, true));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error loading submission: " + e.getMessage(), e);
        }
        return Optional.empty();
    }

    public List<Assignment> findSubmissionsByAssignment(Long assignmentId) {
        List<Assignment> list = new ArrayList<>();
        String sql = "SELECT a.id, a.title, a.subject_id, s.code AS subject_code, s.name AS subject_name, " +
                     "a.description, a.due_date, sa.status, a.created_by, a.created_at, " +
                     "sa.submitted_filename, sa.stored_filename, sa.file_size, sa.submission_notes, sa.submitted_at, " +
                     "u.student_id, u.name AS student_name " +
                     "FROM student_assignments sa " +
                     "JOIN assignments a ON sa.assignment_id = a.id " +
                     "JOIN subjects s ON a.subject_id = s.id " +
                     "JOIN users u ON sa.student_id = u.student_id " +
                     "WHERE sa.assignment_id = ? AND sa.submitted_filename IS NOT NULL " +
                     "ORDER BY sa.submitted_at DESC";

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, assignmentId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Assignment a = mapRowToAssignment(rs, true, true);
                    a.setStudentId(rs.getString("student_id"));
                    a.setStudentName(rs.getString("student_name"));
                    list.add(a);
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error loading submissions for assignment " + assignmentId + ": " + e.getMessage(), e);
        }
        return list;
    }

    public Assignment createAssignment(Assignment assignment) {
        String sql = "INSERT INTO assignments (title, subject_id, description, due_date, created_by) " +
                     "VALUES (?, ?, ?, ?, ?)";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql, PreparedStatement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, assignment.getTitle().trim());
            ps.setLong(2, assignment.getSubjectId());
            ps.setString(3, assignment.getDescription() != null ? assignment.getDescription().trim() : "");
            ps.setDate(4, Date.valueOf(assignment.getDueDate()));
            ps.setString(5, assignment.getCreatedBy() != null ? assignment.getCreatedBy() : "ADMIN");

            ps.executeUpdate();
            try (ResultSet rs = ps.getGeneratedKeys()) {
                if (rs.next()) {
                    assignment.setId(rs.getLong(1));
                }
            }
            return assignment;
        } catch (SQLException e) {
            throw new RuntimeException("Database error creating assignment: " + e.getMessage(), e);
        }
    }

    public boolean updateAssignment(Long id, Assignment assignment) {
        String sql = "UPDATE assignments SET title = ?, subject_id = ?, description = ?, due_date = ? " +
                     "WHERE id = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, assignment.getTitle().trim());
            ps.setLong(2, assignment.getSubjectId());
            ps.setString(3, assignment.getDescription() != null ? assignment.getDescription().trim() : "");
            ps.setDate(4, Date.valueOf(assignment.getDueDate()));
            ps.setLong(5, id);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("Database error updating assignment: " + e.getMessage(), e);
        }
    }

    public boolean deleteAssignment(Long id) {
        String sql = "DELETE FROM assignments WHERE id = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, id);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("Database error deleting assignment: " + e.getMessage(), e);
        }
    }

    public void updateStudentStatus(Long assignmentId, String studentId, String status) {
        String checkSql = "SELECT id FROM student_assignments WHERE assignment_id = ? AND student_id = ?";
        String updateSql = "UPDATE student_assignments SET status = ? WHERE assignment_id = ? AND student_id = ?";
        String insertSql = "INSERT INTO student_assignments (assignment_id, student_id, status) VALUES (?, ?, ?)";

        try (Connection conn = dataSource.getConnection()) {
            boolean exists = false;
            try (PreparedStatement checkPs = conn.prepareStatement(checkSql)) {
                checkPs.setLong(1, assignmentId);
                checkPs.setString(2, studentId.trim());
                try (ResultSet rs = checkPs.executeQuery()) {
                    exists = rs.next();
                }
            }

            if (exists) {
                try (PreparedStatement updatePs = conn.prepareStatement(updateSql)) {
                    updatePs.setString(1, status.toUpperCase().trim());
                    updatePs.setLong(2, assignmentId);
                    updatePs.setString(3, studentId.trim());
                    updatePs.executeUpdate();
                }
            } else {
                try (PreparedStatement insertPs = conn.prepareStatement(insertSql)) {
                    insertPs.setLong(1, assignmentId);
                    insertPs.setString(2, studentId.trim());
                    insertPs.setString(3, status.toUpperCase().trim());
                    insertPs.executeUpdate();
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error updating assignment status: " + e.getMessage(), e);
        }
    }

    public void saveSubmission(Long assignmentId, String studentId, String submittedFilename,
                               String storedFilename, long fileSize, String notes, String status, Timestamp submittedAt) {
        String checkSql = "SELECT id FROM student_assignments WHERE assignment_id = ? AND student_id = ?";
        String updateSql = "UPDATE student_assignments SET status = ?, submitted_filename = ?, stored_filename = ?, " +
                           "file_size = ?, submission_notes = ?, submitted_at = ? " +
                           "WHERE assignment_id = ? AND student_id = ?";
        String insertSql = "INSERT INTO student_assignments (assignment_id, student_id, status, submitted_filename, " +
                           "stored_filename, file_size, submission_notes, submitted_at) " +
                           "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        try (Connection conn = dataSource.getConnection()) {
            boolean exists = false;
            try (PreparedStatement checkPs = conn.prepareStatement(checkSql)) {
                checkPs.setLong(1, assignmentId);
                checkPs.setString(2, studentId.trim());
                try (ResultSet rs = checkPs.executeQuery()) {
                    exists = rs.next();
                }
            }

            if (exists) {
                try (PreparedStatement updatePs = conn.prepareStatement(updateSql)) {
                    updatePs.setString(1, status.toUpperCase().trim());
                    updatePs.setString(2, submittedFilename);
                    updatePs.setString(3, storedFilename);
                    updatePs.setLong(4, fileSize);
                    updatePs.setString(5, notes != null ? notes.trim() : null);
                    updatePs.setTimestamp(6, submittedAt);
                    updatePs.setLong(7, assignmentId);
                    updatePs.setString(8, studentId.trim());
                    updatePs.executeUpdate();
                }
            } else {
                try (PreparedStatement insertPs = conn.prepareStatement(insertSql)) {
                    insertPs.setLong(1, assignmentId);
                    insertPs.setString(2, studentId.trim());
                    insertPs.setString(3, status.toUpperCase().trim());
                    insertPs.setString(4, submittedFilename);
                    insertPs.setString(5, storedFilename);
                    insertPs.setLong(6, fileSize);
                    insertPs.setString(7, notes != null ? notes.trim() : null);
                    insertPs.setTimestamp(8, submittedAt);
                    insertPs.executeUpdate();
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error saving submission: " + e.getMessage(), e);
        }
    }

    private Assignment mapRowToAssignment(ResultSet rs, boolean hasStatus, boolean hasSubmission) throws SQLException {
        Assignment assignment = new Assignment();
        assignment.setId(rs.getLong("id"));
        assignment.setTitle(rs.getString("title"));
        assignment.setSubjectId(rs.getLong("subject_id"));
        assignment.setSubjectCode(rs.getString("subject_code"));
        assignment.setSubjectName(rs.getString("subject_name"));
        assignment.setDescription(rs.getString("description"));
        Date d = rs.getDate("due_date");
        if (d != null) {
            assignment.setDueDate(d.toLocalDate());
        }
        if (hasStatus) {
            assignment.setStatus(rs.getString("status"));
        } else {
            assignment.setStatus("PENDING");
        }
        assignment.setCreatedBy(rs.getString("created_by"));
        Timestamp ts = rs.getTimestamp("created_at");
        if (ts != null) {
            assignment.setCreatedAt(ts.toLocalDateTime());
        }

        if (hasSubmission) {
            try {
                assignment.setSubmittedFilename(rs.getString("submitted_filename"));
                assignment.setStoredFilename(rs.getString("stored_filename"));
                long size = rs.getLong("file_size");
                if (!rs.wasNull()) {
                    assignment.setFileSize(size);
                }
                assignment.setSubmissionNotes(rs.getString("submission_notes"));
                Timestamp subTs = rs.getTimestamp("submitted_at");
                if (subTs != null) {
                    assignment.setSubmittedAt(subTs.toLocalDateTime());
                }
            } catch (SQLException ignored) {
                // Ignore if query did not select submission columns
            }
        }

        return assignment;
    }
}
