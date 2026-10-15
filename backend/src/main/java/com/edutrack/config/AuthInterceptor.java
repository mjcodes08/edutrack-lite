package com.edutrack.config;

import com.edutrack.exception.ForbiddenException;
import com.edutrack.exception.UnauthorizedException;
import com.edutrack.model.User;
import com.edutrack.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Enforces session-based authentication and role-based access control.
 * Restricts /api/admin/** strictly to users with the ADMIN role.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        HttpSession session = request.getSession(false);
        User user = session != null ? (User) session.getAttribute(AuthService.SESSION_USER_KEY) : null;

        if (user == null) {
            throw new UnauthorizedException("Session expired or unauthorized. Please log in.");
        }

        String uri = request.getRequestURI();
        if (uri.startsWith("/api/admin") && !"ADMIN".equalsIgnoreCase(user.getRole())) {
            throw new ForbiddenException("Access denied: Administrator privileges are required to access this resource.");
        }

        return true;
    }
}
