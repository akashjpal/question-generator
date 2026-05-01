import supabase from "./supabaseClient";

export async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

console.log("Authheader ",authHeader);

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
  }

  req.user = data.user; // attach user to request for use in route
  next();
}