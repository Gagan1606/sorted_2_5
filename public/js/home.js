const API_BASE = '/api';
// PWA Install Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Show custom install button
    const installDiv = document.createElement('div');
    installDiv.id = 'installPrompt';
    installDiv.innerHTML = `
            <div style="background:#18181b;border-top:1px solid #27272a;color:#e4e4e7;padding:16px;text-align:center;position:fixed;bottom:0;left:0;right:0;z-index:9999;box-shadow:0 -2px 10px rgba(0,0,0,0.4);">
  <p style="margin:0 0 12px 0;font-weight:600;color:#fafafa;">Install Photo Share App</p>
  <button onclick="installPWA()" style="background:#fafafa;color:#18181b;border:none;padding:10px 20px;border-radius:10px;font-weight:600;cursor:pointer;margin-right:10px;">Install</button>
  <button onclick="dismissInstall()" style="background:transparent;color:#e4e4e7;border:1px solid #3f3f46;padding:10px 20px;border-radius:10px;font-weight:600;cursor:pointer;">Not Now</button>
</div>
    `;
    document.body.appendChild(installDiv);
});

window.installPWA = async function () {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        document.getElementById('installPrompt').remove();
    }
};

window.dismissInstall = function () {
    document.getElementById('installPrompt').remove();
};

let currentUser = null;
let detectedUsersData = [];
let pendingGroupData = null;

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/current-user`, {
            credentials: 'include'
        });

        if (!response.ok) {
            window.location.href = 'index.html';
            return;
        }

        const data = await response.json();
        currentUser = data.user;
        document.getElementById('username-display').textContent = currentUser.username;
    } catch (error) {
        window.location.href = 'index.html';
    }
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        credentials: 'include'
    });
    window.location.href = 'index.html';
});

// Modal controls
const createGroupModal = document.getElementById('createGroupModal');
const instantShareModal = document.getElementById('instantShareModal');

document.getElementById('createGroupBtn').addEventListener('click', () => {
    createGroupModal.style.display = 'block';
});

document.getElementById('instantShareBtn').addEventListener('click', () => {
    instantShareModal.style.display = 'block';
});

document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
        e.target.closest('.modal').style.display = 'none';
    });
});

// Create Group Form
document.getElementById('createGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const groupName = document.getElementById('groupName').value;
    const photos = document.getElementById('groupPhotos').files;

    if (photos.length === 0) {
        alert('Please select photos');
        return;
    }

    const formData = new FormData();
    formData.append('groupName', groupName);

    for (let photo of photos) {
        formData.append('photos', photo);
    }

    const progressDiv = document.getElementById('upload-progress');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Creating...';
    progressDiv.innerHTML = `
        <div class="loading-spinner">
            <p>🔄 Uploading ${photos.length} photo(s)...</p>
            <p>⏱️ This may take 30-60 seconds</p>
            <p style="font-size: 12px; color: #888;">Detecting faces and removing duplicates...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/create-group`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            // FIX 2: Show detected users for confirmation
            detectedUsersData = data.detectedUsers;
            pendingGroupData = { groupId: data.groupId, groupName };

            document.getElementById('createGroupForm').style.display = 'none';
            progressDiv.style.display = 'none';

            const detectedSection = document.getElementById('detectedUsersSection');
            detectedSection.style.display = 'block';

            displayDetectedUsers();
        } else {
            alert(data.error || 'Failed to create group');
            progressDiv.textContent = '';
        }
    } catch (error) {
        console.error('Create group error:', error);
        alert('Failed to create group');
        progressDiv.textContent = '';
    }
});

function displayDetectedUsers() {
    const listDiv = document.getElementById('detectedUsersList');
    listDiv.innerHTML = '';

    detectedUsersData.forEach((user, index) => {
        const tag = document.createElement('div');
        tag.className = 'user-tag';
        tag.innerHTML = `
            ${user.username}
            <button onclick="removeDetectedUser(${index})">×</button>
        `;
        listDiv.appendChild(tag);
    });
}

function removeDetectedUser(index) {
    detectedUsersData.splice(index, 1);
    displayDetectedUsers();
}

// Add additional user
document.getElementById('addUserBtn').addEventListener('click', () => {
    const username = document.getElementById('additionalUsername').value.trim();
    if (username) {
        detectedUsersData.push({ username });
        displayDetectedUsers();
        document.getElementById('additionalUsername').value = '';
    }
});

// Confirm group creation
document.getElementById('confirmGroupBtn').addEventListener('click', async () => {
    // Add additional members to group
    for (const user of detectedUsersData) {
        await fetch(`${API_BASE}/add-member-to-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId: pendingGroupData.groupId,
                username: user.username
            }),
            credentials: 'include'
        });
    }

    alert('Group created successfully!');
    createGroupModal.style.display = 'none';
    loadGroups();

    // Reset form
    document.getElementById('createGroupForm').reset();
    document.getElementById('createGroupForm').style.display = 'block';
    document.getElementById('detectedUsersSection').style.display = 'none';
});

// Instant Share
document.getElementById('instantShareForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const photo = document.getElementById('sharePhoto').files[0];

    if (!photo) {
        alert('Please select a photo');
        return;
    }

    const formData = new FormData();
    formData.append('photo', photo);

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Processing...';

    const resultDiv = document.getElementById('shareResult');
    resultDiv.innerHTML = '<p class="loading">🔄 Detecting faces and sharing photo...</p>';

    try {
        const response = await fetch(`${API_BASE}/instant-share`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        if (data.success) {
            if (data.sentTo.length > 0) {
                resultDiv.innerHTML = `
                    <div class="success-message">
                        <p>✅ Photo shared successfully!</p>
                        <p>Sent to: <strong>${data.sentTo.join(', ')}</strong></p>
                        <button onclick="location.reload()" class="btn-secondary" style="margin-top: 15px;">Done</button>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div class="warning-message">
                        <p>⚠️ No known faces detected in photo</p>
                        <button onclick="location.reload()" class="btn-secondary" style="margin-top: 15px;">Try Another</button>
                    </div>
                `;
            }

            // Reset form
            e.target.reset();
        }
    } catch (error) {
        console.error('Instant share error:', error);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        resultDiv.innerHTML = '<p class="error-message">❌ Failed to share photo. Please try again.</p>';
    }
});

// Load and display groups
document.getElementById('viewGroupsBtn').addEventListener('click', loadGroups);

async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE}/my-groups`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            const groupsList = document.getElementById('groupsList');
            groupsList.innerHTML = '';

            data.groups.forEach(group => {
                const card = document.createElement('div');
                card.className = 'group-card';
                card.innerHTML = `
                    <h3>${group.groupName}</h3>
                    <p>Created by: ${group.createdBy.username}</p>
                    <p>${new Date(group.createdAt).toLocaleDateString()}</p>
                `;
                card.addEventListener('click', () => {
                    window.location.href = `group.html?id=${group._id}`;
                });
                groupsList.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Load groups error:', error);
    }
}

// Initialize
// ============================================
// SHARED PHOTOS FUNCTIONALITY
// ============================================

// View shared photos button
document.getElementById('viewSharedBtn').addEventListener('click', () => {
    document.getElementById('groupsList').style.display = 'none';
    document.getElementById('sharedPhotosSection').style.display = 'block';
    loadSharedWithMe();
});

// Close shared section
document.getElementById('closeSharedBtn').addEventListener('click', () => {
    document.getElementById('sharedPhotosSection').style.display = 'none';
    document.getElementById('groupsList').style.display = 'grid';
});

// Tab switching
document.getElementById('sharedWithMeTab').addEventListener('click', () => {
    document.getElementById('sharedWithMeTab').classList.add('active');
    document.getElementById('sharedByMeTab').classList.remove('active');
    document.getElementById('sharedWithMeContent').style.display = 'block';
    document.getElementById('sharedByMeContent').style.display = 'none';
    loadSharedWithMe();
});

document.getElementById('sharedByMeTab').addEventListener('click', () => {
    document.getElementById('sharedByMeTab').classList.add('active');
    document.getElementById('sharedWithMeTab').classList.remove('active');
    document.getElementById('sharedByMeContent').style.display = 'block';
    document.getElementById('sharedWithMeContent').style.display = 'none';
    loadSharedByMe();
});

// Load photos shared with current user
async function loadSharedWithMe() {
    try {
        const response = await fetch(`${API_BASE}/shared-with-me`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('sharedWithMePhotos');
            container.innerHTML = '';

            if (data.photos.length === 0) {
                container.innerHTML = '<p class="empty-message">No photos shared with you yet</p>';
                return;
            }

            data.photos.forEach(photo => {
                const photoDiv = document.createElement('div');
                photoDiv.className = 'photo-item' + (photo.viewed ? '' : ' unviewed');

                const img = document.createElement('img');
                img.src = `data:${photo.contentType};base64,${photo.photoData}`;
                img.addEventListener('click', () => {
                    markAsViewed(photo._id);
                    // Open full size view
                    const fullView = window.open('', '_blank');
                    fullView.document.write(`<img src="${img.src}" style="max-width:100%;height:auto;">`);
                });

                const info = document.createElement('div');
                info.className = 'photo-info';
                info.innerHTML = `
                    <p><strong>From:</strong> ${photo.sharedBy}</p>
                    <p><strong>Date:</strong> ${new Date(photo.sharedAt).toLocaleDateString()}</p>
                    <p><strong>People:</strong> ${photo.detectedFaces.map(f => f.username).join(', ')}</p>
                    ${!photo.viewed ? '<span class="badge-new">NEW</span>' : ''}
                `;

                photoDiv.appendChild(img);
                photoDiv.appendChild(info);
                container.appendChild(photoDiv);
            });
        }
    } catch (error) {
        console.error('Error loading shared photos:', error);
        alert('Failed to load shared photos');
    }
}

// Load photos shared by current user
async function loadSharedByMe() {
    try {
        const response = await fetch(`${API_BASE}/shared-by-me`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('sharedByMePhotos');
            container.innerHTML = '';

            if (data.photos.length === 0) {
                container.innerHTML = '<p class="empty-message">You haven\'t shared any photos yet</p>';
                return;
            }

            data.photos.forEach(photo => {
                const photoDiv = document.createElement('div');
                photoDiv.className = 'photo-item';

                const img = document.createElement('img');
                img.src = `data:${photo.contentType};base64,${photo.photoData}`;
                img.addEventListener('click', () => {
                    const fullView = window.open('', '_blank');
                    fullView.document.write(`<img src="${img.src}" style="max-width:100%;height:auto;">`);
                });

                const info = document.createElement('div');
                info.className = 'photo-info';
                info.innerHTML = `
                    <p><strong>Shared with:</strong> ${photo.sharedWith.join(', ')}</p>
                    <p><strong>Date:</strong> ${new Date(photo.sharedAt).toLocaleDateString()}</p>
                    <p><strong>Views:</strong> ${photo.viewCount}/${photo.sharedWith.length}</p>
                `;

                photoDiv.appendChild(img);
                photoDiv.appendChild(info);
                container.appendChild(photoDiv);
            });
        }
    } catch (error) {
        console.error('Error loading shared photos:', error);
        alert('Failed to load shared photos');
    }
}

// Mark photo as viewed
async function markAsViewed(photoId) {
    try {
        await fetch(`${API_BASE}/mark-viewed/${photoId}`, {
            method: 'POST',
            credentials: 'include'
        });

        // Refresh the list to update badge
        loadSharedWithMe();
    } catch (error) {
        console.error('Error marking photo as viewed:', error);
    }
}

// Initialize
checkAuth();
