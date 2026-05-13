// Register a new user
async function registerUser(email, password, displayName) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { display_name: displayName }
            }
        });

        if (error) throw error;

        // Profile row is created automatically by the database trigger (handle_new_user).
        // No manual insert needed here - avoids RLS timing issues on fresh signups.

        return { success: true, user: data.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Login user
async function loginUser(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        return { success: true, user: data.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Logout user
async function logoutUser() {
    try {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Get current user's role from "users" table
async function getUserRole(uid) {
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('id', uid)
            .single();

        if (error) throw error;
        return data ? data.role : null;
    } catch (error) {
        console.error('Error getting user role:', error);
        return null;
    }
}

// Get current user's data from "users" table
async function getUserData(uid) {
    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', uid)
            .single();

        if (error) throw error;
        return data ? { displayName: data.display_name, email: data.email, role: data.role } : null;
    } catch (error) {
        console.error('Error getting user data:', error);
        return null;
    }
}

// Redirect based on role
async function redirectBasedOnRole(user) {
    const role = await getUserRole(user.id);
    if (role === 'admin') {
        window.location.href = 'admin-dashboard.html';
    } else {
        window.location.href = 'user-dashboard.html';
    }
}

// Auth state guard for protected pages
function requireAuth(allowedRole) {
    return new Promise((resolve, reject) => {
        supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
            if (!session) {
                window.location.href = 'index.html';
                reject('Not authenticated');
                return;
            }
            const user = session.user;
            const role = await getUserRole(user.id);
            if (allowedRole && role !== allowedRole) {
                // Redirect to the correct dashboard for their role instead of login
                if (role === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                } else {
                    window.location.href = 'user-dashboard.html';
                }
                reject('Unauthorized role');
                return;
            }
            resolve({ user, role });
        });
    });
}

// Get current session (helper)
async function getCurrentUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session ? session.user : null;
}
