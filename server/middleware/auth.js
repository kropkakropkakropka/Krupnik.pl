const { verifyToken } = require('../config/jwt');

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Brak tokenu autoryzacyjnego' });
  }
  
  const token = authHeader.split(' ')[1];
  
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ message: 'Nieprawidłowy token lub token wygasł' });
  }
  
  req.user = decoded;
  
  next();
};

const authenticateAdmin = (req, res, next) => {
  authenticateUser(req, res, () => {
    if (req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ message: 'Brak dostępu - wymagane uprawnienia administratora' });
    }
  });
};

module.exports = {
  authenticateUser,
  authenticateAdmin
};