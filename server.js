// ============================================
// FILE: server.js
// ============================================
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const MongoStore = require('connect-mongo').default;

const User = require('./models/User');
const Group = require('./models/Group');
const Photo = require('./models/Photo');
const SharedPhoto = require('./models/SharedPhoto');

const app = express();
app.set('trust proxy', 1);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Face API Configuration
const FACE_API_URL = process.env.FACE_API_URL || 'https://YOUR-SPACE.hf.space';

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//   credentials: true
// }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : 'http://localhost:3000',
  credentials: true
}));


// app.use(session({
//   secret: process.env.SESSION_SECRET,
//   resave: false,
//   saveUninitialized: false,
//   cookie: {
//     secure: process.env.NODE_ENV === 'production', // HTTPS only in production
//     httpOnly: true, // Prevent XSS
//     maxAge: 24 * 60 * 60 * 1000, // 24 hours
//     sameSite: 'strict' // CSRF protection
//   },
//   name: 'sessionId' // Don't use default 'connect.sid'
// }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none' // IMPORTANT: Change for cross-domain
  },
  name: 'sessionId',
  proxy: true
}));

// Serve static files
app.use(express.static('public'));
const helmet = require('helmet');
app.use(helmet());
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { success: false, error: 'Too many requests, please try again later' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  message: { success: false, error: 'Too many login attempts, please try again later' }
});
app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);

const validator = require('validator');

// Add validation helper:
function validateSignupInput(username, phoneNumber, password) {
  const errors = [];

  // Username validation
  if (!validator.isAlphanumeric(username, 'en-US', { ignore: '_-' })) {
    errors.push('Username can only contain letters, numbers, hyphens, and underscores');
  }

  if (username.length < 3 || username.length > 20) {
    errors.push('Username must be 3-20 characters');
  }

  // Phone validation
  if (!validator.isMobilePhone(phoneNumber, 'any')) {
    errors.push('Invalid phone number');
  }

  // Password validation
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!validator.isStrongPassword(password, {
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 0
  })) {
    errors.push('Password must contain uppercase, lowercase, and number');
  }

  return errors;
}


// ============================================
// DATABASE CONNECTION
// ============================================

// ============================================
// DATABASE CONNECTION
// ============================================

// console.log('Attempting to connect to MongoDB...');
// console.log('MONGO_URI exists:', !!process.env.MONGO_URI);
// console.log('MONGO_URI preview:', process.env.MONGO_URI ? process.env.MONGO_URI.substring(0, 20) + '...' : 'undefined');

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    // console.log('Database name:', mongoose.connection.db.databaseName);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Full error:', err);
  });

// Monitor connection events
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('⚠️ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('❌ Mongoose disconnected from MongoDB');
});

// Keep Face API warm
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      await fetch(`${FACE_API_URL}/health`);
      console.log('🔥 Face API keepalive ping sent');
    } catch (err) {
      console.log('⚠️ Face API keepalive failed:', err.message);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// const MONGO_URI = 'mongodb+srv://Gagan:gagan451@sorted.sjbfgbm.mongodb.net/photoshare?retryWrites=true&w=majority';
// console.log('🔍 Hardcoded URI check:', MONGO_URI.includes('sorted') ? '✅ Using SORTED cluster' : '❌ Using WRONG cluster');
// console.log('🔍 Connecting to:', MONGO_URI.substring(0, 50) + '...');

// mongoose.connect(MONGO_URI)

// ============================================
// AUTH MIDDLEWARE
// ============================================

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  next();
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Calculate image hash for duplicate detection
const sharp = require('sharp');

async function generateImageVariants(buffer) {
  return {
    thumb: await sharp(buffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 50 })
      .toBuffer(),

    medium: await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70, progressive: true })
      .toBuffer(),

    full: buffer
  };
}

function calculateImageHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// Call Face API
async function callFaceAPI(endpoint, method, data) {
  const response = await fetch(`${FACE_API_URL}${endpoint}`, {
    method,
    body: data,
    headers: data instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Face API error: ${error}`);
  }

  return await response.json();
}

// Match face embeddings against all users
async function matchFaceToUsers(faceEmbedding, threshold = 0.35) {
  const allUsers = await User.find({}, { username: 1, faceEmbedding: 1 });

  const profileEmbeddings = {};
  allUsers.forEach(user => {
    profileEmbeddings[user.username] = user.faceEmbedding;
  });

  const matchResult = await callFaceAPI('/match-face', 'POST', JSON.stringify({
    face_embedding: faceEmbedding,
    profile_embeddings: profileEmbeddings,
    threshold
  }));

  if (matchResult.matched_profile) {
    const user = allUsers.find(u => u.username === matchResult.matched_profile);
    return {
      userId: user._id,
      username: user.username,
      confidence: matchResult.confidence
    };
  }

  return null;
}

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/signup', upload.single('profilePhoto'), async (req, res) => {
  try {
    const { username, password, phoneNumber } = req.body;

    // Validation
    if (!username || !password || !phoneNumber || !req.file) {
      return res.status(400).json({
        success: false,
        error: 'All fields required'
      });
    }

    // Use in signup route:
    const validationErrors = validateSignupInput(username, phoneNumber, password);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join('. ')
      });
    }


    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      return res.status(400).json({
        success: false,
        error: 'Password must contain uppercase, lowercase, and number'
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ username }, { phoneNumber }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username or phone number already exists'
      });
    }

    // Extract face embedding
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer]), req.file.originalname);

    const faceResult = await callFaceAPI('/extract-profile', 'POST', formData);

    if (!faceResult.success || !faceResult.embedding) {
      return res.status(400).json({
        success: false,
        error: 'No face detected in profile photo'
      });
    }

    // Hash password - CRITICAL SECURITY FIX
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with hashed password
    const user = await User.create({
      username,
      password: hashedPassword,  // Store hashed, not plain text
      phoneNumber,
      profilePhoto: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      },
      faceEmbedding: faceResult.embedding
    });

    req.session.userId = user._id;

    res.json({
      success: true,
      message: 'Signup successful',
      userId: user._id
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Compare hashed password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    req.session.userId = user._id;

    res.json({
      success: true,
      message: 'Login successful',
      userId: user._id,
      username: user.username
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/current-user', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId, {
      username: 1,
      phoneNumber: 1
    });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GROUP ROUTES
// ============================================
async function batchMatchFacesToUsers(faceEmbeddings, threshold = 0.35) {
  if (faceEmbeddings.length === 0) return [];

  const allUsers = await User.find({}, { username: 1, faceEmbedding: 1 });

  const profileEmbeddings = {};
  allUsers.forEach(user => {
    profileEmbeddings[user.username] = user.faceEmbedding;
  });

  const matchResults = await callFaceAPI('/batch-match', 'POST', JSON.stringify({
    face_embeddings: faceEmbeddings,
    profile_embeddings: profileEmbeddings,
    threshold
  }));

  if (!matchResults.success) return [];

  return matchResults.matches.map(match => {
    if (match.matched_profile) {
      const user = allUsers.find(u => u.username === match.matched_profile);
      return {
        userId: user._id,
        username: user.username,
        confidence: match.confidence
      };
    }
    return null;
  });
}

app.post('/api/create-group', requireAuth, upload.array('photos', 50), async (req, res) => {
  try {
    const { groupName, memberUsernames } = req.body;
    const userId = req.session.userId;

    if (!groupName || !req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Group name and photos required'
      });
    }

    // Create group
    const group = await Group.create({
      groupName,
      createdBy: userId,
      members: [userId]
    });

    // Process each photo
    const detectedUsers = new Set();
    const processedPhotos = [];
    const seenHashes = new Set();


    // Detect duplicates first (sync operation)
    const uniqueFiles = [];
    for (const file of req.files) {
      const imageHash = calculateImageHash(file.buffer);
      if (!seenHashes.has(imageHash)) {
        seenHashes.add(imageHash);
        uniqueFiles.push({ file, imageHash });
      }
    }

    // Process all photos in parallel
    const photoPromises = uniqueFiles.map(async ({ file, imageHash }) => {
      // Detect faces
      const formData = new FormData();
      formData.append('file', new Blob([file.buffer]), file.originalname);

      const detectResult = await callFaceAPI('/detect-faces', 'POST', formData);

      if (!detectResult.success || detectResult.total_faces === 0) return null;

      // Batch match all faces
      const faceEmbeddings = detectResult.faces.map(f => f.embedding);
      const matches = await batchMatchFacesToUsers(faceEmbeddings);

      const detectedFaces = [];
      const photoUsers = new Set();

      detectResult.faces.forEach((face, idx) => {
        const match = matches[idx];
        if (match && !photoUsers.has(match.userId.toString())) {
          detectedFaces.push({
            user: match.userId,
            confidence: match.confidence,
            facialArea: face.facial_area
          });
          photoUsers.add(match.userId.toString());
        }
      });

      // Save photo
      // Replace the Photo.create section with:
      const variants = await generateImageVariants(file.buffer);

      const photo = await Photo.create({
        photoData: variants.full,
        mediumImage: variants.medium,
        thumbnail: variants.thumb,
        contentType: file.mimetype,
        uploadedBy: userId,
        group: group._id,
        detectedFaces,
        capturedAt: new Date(),
        imageHash
      });

      return { photoId: photo._id, detectedUserIds: Array.from(photoUsers) };
    });

    const results = await Promise.all(photoPromises);

    // Collect all detected users and photo IDs
    for (const result of results) {
      if (result) {
        processedPhotos.push(result.photoId);
        result.detectedUserIds.forEach(uid => detectedUsers.add(uid));
      }
    }
    // Update group with photos and detected members
    const detectedUserIds = Array.from(detectedUsers);
    await group.updateOne({
      $addToSet: { members: { $each: detectedUserIds } },
      $push: { photos: { $each: processedPhotos } }
    });

    // Update user groups
    await User.updateMany(
      { _id: { $in: [...detectedUserIds, userId] } },
      { $addToSet: { groups: group._id } }
    );

    // Get usernames for detected users
    const detectedUserObjects = await User.find(
      { _id: { $in: detectedUserIds } },
      { username: 1 }
    );

    res.json({
      success: true,
      groupId: group._id,
      detectedUsers: detectedUserObjects.map(u => ({
        userId: u._id,
        username: u.username
      })),
      totalPhotos: processedPhotos.length
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/add-member-to-group', requireAuth, async (req, res) => {
  try {
    const { groupId, username } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await Group.updateOne(
      { _id: groupId },
      { $addToSet: { members: user._id } }
    );

    await User.updateOne(
      { _id: user._id },
      { $addToSet: { groups: groupId } }
    );

    res.json({ success: true, message: 'Member added' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/my-groups', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const groups = await Group.find({
      members: userId
    }).populate('createdBy', 'username')
      .select('groupName createdBy createdAt');

    res.json({ success: true, groups });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/group/:groupId', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.session.userId;

    const group = await Group.findOne({
      _id: groupId,
      members: userId
    }).populate('members', 'username')
      .populate('createdBy', 'username');

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      });
    }

    // Get all photos sorted by date
    const allPhotos = await Photo.find({
      group: groupId
    }).sort({ capturedAt: -1 })
      .populate('uploadedBy', 'username')
      .populate('detectedFaces.user', 'username');

    // Get user's personal photos
    const userPhotos = allPhotos.filter(photo =>
      photo.detectedFaces.some(face =>
        face.user._id.toString() === userId.toString()
      )
    );

    // Convert photos to base64
    const photosWithData = allPhotos.map(photo => ({
      _id: photo._id,
      //photoData: photo.photoData.toString('base64'),
      contentType: photo.contentType,
      uploadedBy: photo.uploadedBy.username,
      detectedFaces: photo.detectedFaces.map(f => ({
        username: f.user.username,
        confidence: f.confidence
      })),
      capturedAt: photo.capturedAt
    }));

    const userPhotosWithData = userPhotos.map(photo => ({
      _id: photo._id,
      //photoData: photo.photoData.toString('base64'),
      contentType: photo.contentType,
      capturedAt: photo.capturedAt
    }));

    res.json({
      success: true,
      group: {
        groupName: group.groupName,
        members: group.members,
        createdBy: group.createdBy
      },
      allPhotos: photosWithData,
      userPhotos: userPhotosWithData
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// app.get('/api/photo/:photoId', requireAuth, async (req, res) => {
//   try {
//     const { photoId } = req.params;
//     const userId = req.session.userId;

//     // Get photo
//     const photo = await Photo.findById(photoId).populate('group');

//     if (!photo) {
//       return res.status(404).json({
//         success: false,
//         error: 'Photo not found'
//       });
//     }

//     // Check authorization: user must be member of the group
//     const group = await Group.findOne({
//       _id: photo.group._id,
//       members: userId
//     });

//     if (!group) {
//       return res.status(403).json({
//         success: false,
//         error: 'Unauthorized: You are not a member of this group'
//       });
//     }

//     // Serve photo
//     res.set('Content-Type', photo.contentType);
//     res.send(photo.photoData);

//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });


// ============================================
// INSTANT SHARE
// ============================================

// app.post('/api/instant-share', requireAuth, upload.single('photo'), async (req, res) => {
//   try {
//     const userId = req.session.userId;

//     if (!req.file) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Photo required' 
//       });
//     }

//     // Detect faces
//     const formData = new FormData();
//     formData.append('file', new Blob([req.file.buffer]), req.file.originalname);

//     const detectResult = await callFaceAPI('/detect-faces', 'POST', formData);

//     if (!detectResult.success || detectResult.total_faces === 0) {
//       return res.json({ 
//         success: true, 
//         message: 'No faces detected',
//         sentTo: []
//       });
//     }

//     // Match faces and send to respective groups
//     const sentToUsers = new Set();

//     for (const face of detectResult.faces) {
//       const match = await matchFaceToUsers(face.embedding);
//       if (match) {
//         sentToUsers.add(match.userId.toString());
//       }
//     }

//     // TODO: Create notifications or add to user's inbox
//     // For now, just return who it would be sent to

//     const users = await User.find({ 
//       _id: { $in: Array.from(sentToUsers) } 
//     }, { username: 1 });

//     res.json({ 
//       success: true, 
//       message: 'Photo shared',
//       sentTo: users.map(u => u.username)
//     });

//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });
// ============================================
// INSTANT SHARE
// ============================================

app.get('/api/image/:photoId', requireAuth, async (req, res) => {
  try {
    const { photoId } = req.params;
    const { size = 'medium' } = req.query;
    const userId = req.session.userId;

    const photo = await Photo.findById(photoId).populate('group');

    if (!photo) {
      return res.status(404).send('Not found');
    }

    // Authorization check
    const group = await Group.findOne({
      _id: photo.group._id,
      members: userId
    });

    if (!group) {
      return res.status(403).send('Unauthorized');
    }

    let imageData;
    switch (size) {
      case 'thumb':
        imageData = photo.thumbnail;
        break;
      case 'medium':
        imageData = photo.mediumImage;
        break;
      case 'full':
        imageData = photo.photoData;
        break;
      default:
        imageData = photo.mediumImage;
    }

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000'
    });

    res.send(imageData);
  } catch (error) {
    res.status(500).send('Error loading image');
  }
});

app.post('/api/instant-share', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Photo required'
      });
    }

    // Detect faces
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer]), req.file.originalname);

    const detectResult = await callFaceAPI('/detect-faces', 'POST', formData);

    if (!detectResult.success || detectResult.total_faces === 0) {
      return res.json({
        success: true,
        message: 'No faces detected',
        sentTo: []
      });
    }

    // Match faces to users
    // Batch match faces (FASTER)
    const detectedUsers = new Set();
    const detectedFaces = [];

    const faceEmbeddings = detectResult.faces.map(f => f.embedding);
    const matches = await batchMatchFacesToUsers(faceEmbeddings);

    detectResult.faces.forEach((face, idx) => {
      const match = matches[idx];
      if (match) {
        detectedUsers.add(match.userId.toString());
        detectedFaces.push({
          user: match.userId,
          confidence: match.confidence,
          facialArea: face.facial_area
        });
      }
    });
    if (detectedUsers.size === 0) {
      return res.json({
        success: true,
        message: 'No known faces detected',
        sentTo: []
      });
    }

    // Save shared photo
    const sharedPhoto = await SharedPhoto.create({
      photoData: req.file.buffer,
      contentType: req.file.mimetype,
      sharedBy: userId,
      sharedWith: Array.from(detectedUsers),
      detectedFaces
    });

    // Get usernames of recipients
    const recipients = await User.find({
      _id: { $in: Array.from(detectedUsers) }
    }, { username: 1 });

    res.json({
      success: true,
      message: 'Photo shared successfully',
      photoId: sharedPhoto._id,
      sentTo: recipients.map(u => u.username)
    });

  } catch (error) {
    console.error('Instant share error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get photos shared WITH current user
// app.get('/api/shared-with-me', requireAuth, async (req, res) => {
//   try {
//     const userId = req.session.userId;

//     const sharedPhotos = await SharedPhoto.find({
//       sharedWith: userId
//     })
//       .sort({ sharedAt: -1 })
//       .populate('sharedBy', 'username')
//       .populate('detectedFaces.user', 'username');

//     const photosWithData = sharedPhotos.map(photo => ({
//       _id: photo._id,
//       photoData: photo.photoData.toString('base64'),
//       contentType: photo.contentType,
//       sharedBy: photo.sharedBy.username,
//       sharedAt: photo.sharedAt,
//       detectedFaces: photo.detectedFaces.map(f => ({
//         username: f.user.username,
//         confidence: f.confidence
//       })),
//       viewed: photo.viewed.some(v => v.user.toString() === userId.toString())
//     }));

//     res.json({
//       success: true,
//       photos: photosWithData,
//       totalUnviewed: photosWithData.filter(p => !p.viewed).length
//     });

//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // Get photos shared BY current user
// app.get('/api/shared-by-me', requireAuth, async (req, res) => {
//   try {
//     const userId = req.session.userId;

//     const sharedPhotos = await SharedPhoto.find({
//       sharedBy: userId
//     })
//       .sort({ sharedAt: -1 })
//       .populate('sharedWith', 'username')
//       .populate('detectedFaces.user', 'username');

//     const photosWithData = sharedPhotos.map(photo => ({
//       _id: photo._id,
//       photoData: photo.photoData.toString('base64'),
//       contentType: photo.contentType,
//       sharedWith: photo.sharedWith.map(u => u.username),
//       sharedAt: photo.sharedAt,
//       detectedFaces: photo.detectedFaces.map(f => ({
//         username: f.user.username,
//         confidence: f.confidence
//       })),
//       viewCount: photo.viewed.length
//     }));

//     res.json({
//       success: true,
//       photos: photosWithData
//     });

//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// Get photos shared WITH current user - ADD image endpoint for SharedPhoto
app.get('/api/shared-image/:photoId', requireAuth, async (req, res) => {
  try {
    const { photoId } = req.params;
    const { size = 'medium' } = req.query;
    const userId = req.session.userId;

    const photo = await SharedPhoto.findById(photoId);

    if (!photo) {
      return res.status(404).send('Not found');
    }

    // Authorization check - user must be sender or recipient
    if (photo.sharedBy.toString() !== userId.toString() && 
        !photo.sharedWith.includes(userId)) {
      return res.status(403).send('Unauthorized');
    }

    // For now, SharedPhoto only has full quality
    // You can add compression later
    res.set({
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=31536000'
    });

    res.send(photo.photoData);
  } catch (error) {
    res.status(500).send('Error loading image');
  }
});

// Update shared-with-me endpoint - REMOVE base64
app.get('/api/shared-with-me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const sharedPhotos = await SharedPhoto.find({
      sharedWith: userId
    })
      .sort({ sharedAt: -1 })
      .populate('sharedBy', 'username')
      .populate('detectedFaces.user', 'username');

    const photosWithData = sharedPhotos.map(photo => ({
      _id: photo._id,
      // REMOVED: photoData: photo.photoData.toString('base64'),
      contentType: photo.contentType,
      sharedBy: photo.sharedBy.username,
      sharedAt: photo.sharedAt,
      detectedFaces: photo.detectedFaces.map(f => ({
        username: f.user.username,
        confidence: f.confidence
      })),
      viewed: photo.viewed.some(v => v.user.toString() === userId.toString())
    }));

    res.json({
      success: true,
      photos: photosWithData,
      totalUnviewed: photosWithData.filter(p => !p.viewed).length
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update shared-by-me endpoint - REMOVE base64
app.get('/api/shared-by-me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const sharedPhotos = await SharedPhoto.find({
      sharedBy: userId
    })
      .sort({ sharedAt: -1 })
      .populate('sharedWith', 'username')
      .populate('detectedFaces.user', 'username');

    const photosWithData = sharedPhotos.map(photo => ({
      _id: photo._id,
      // REMOVED: photoData: photo.photoData.toString('base64'),
      contentType: photo.contentType,
      sharedWith: photo.sharedWith.map(u => u.username),
      sharedAt: photo.sharedAt,
      detectedFaces: photo.detectedFaces.map(f => ({
        username: f.user.username,
        confidence: f.confidence
      })),
      viewCount: photo.viewed.length
    }));

    res.json({
      success: true,
      photos: photosWithData
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Mark photo as viewed
app.post('/api/mark-viewed/:photoId', requireAuth, async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.session.userId;

    await SharedPhoto.updateOne(
      {
        _id: photoId,
        sharedWith: userId,
        'viewed.user': { $ne: userId }
      },
      {
        $push: {
          viewed: {
            user: userId,
            viewedAt: new Date()
          }
        }
      }
    );

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
