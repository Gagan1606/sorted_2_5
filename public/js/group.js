const API_BASE = '/api';

const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get('id');

let currentGroup = null;

// Load group data
async function loadGroup() {
    try {
        const response = await fetch(`${API_BASE}/group/${groupId}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGroup = data.group;
            document.getElementById('groupTitle').textContent = currentGroup.groupName;
            
            displayMembers(currentGroup.members);
            displayAllPhotos(data.allPhotos);
            displayUserPhotos(data.userPhotos);
        } else {
            alert('Group not found');
            window.location.href = 'home.html';
        }
    } catch (error) {
        console.error('Load group error:', error);
        alert('Failed to load group');
    }
}

function displayMembers(members) {
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';
    
    members.forEach(member => {
        const tag = document.createElement('div');
        tag.className = 'member-tag';
        tag.textContent = member.username;
        membersList.appendChild(tag);
    });
}

function displayAllPhotos(photos) {
    const container = document.getElementById('allPhotosContainer');
    container.innerHTML = '';
    
    // Group by date
    const photosByDate = {};
    photos.forEach(photo => {
        const date = new Date(photo.capturedAt).toLocaleDateString();
        if (!photosByDate[date]) {
            photosByDate[date] = [];
        }
        photosByDate[date].push(photo);
    });
    
    // Display grouped photos
    Object.keys(photosByDate).sort().reverse().forEach(date => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.textContent = date;
        dateGroup.appendChild(dateHeader);
        
        const photoGrid = document.createElement('div');
        photoGrid.className = 'photo-grid';
        
        photosByDate[date].forEach(photo => {
            const photoItem = document.createElement('div');
            photoItem.className = 'photo-item';
            
            const img = document.createElement('img');
            img.src = `data:${photo.contentType};base64,${photo.photoData}`;
            
            const photoInfo = document.createElement('div');
            photoInfo.className = 'photo-info';
            
            const faces = photo.detectedFaces.map(f => f.username).join(', ');
            photoInfo.innerHTML = `
                <div class="photo-faces">People: ${faces || 'None'}</div>
            `;
            
            photoItem.appendChild(img);
            photoItem.appendChild(photoInfo);
            photoGrid.appendChild(photoItem);
        });
        
        dateGroup.appendChild(photoGrid);
        container.appendChild(dateGroup);
    });
}

function displayUserPhotos(photos) {
    const container = document.getElementById('yourPhotosContainer');
    container.innerHTML = '';
    
    if (photos.length === 0) {
        container.innerHTML = '<p>No photos of you in this group</p>';
        return;
    }
    
    const photoGrid = document.createElement('div');
    photoGrid.className = 'photo-grid';
    
    photos.forEach(photo => {
        const photoItem = document.createElement('div');
        photoItem.className = 'photo-item';
        
        const img = document.createElement('img');
        img.src = `data:${photo.contentType};base64,${photo.photoData}`;
        
        photoItem.appendChild(img);
        photoGrid.appendChild(photoItem);
    });
    
    container.appendChild(photoGrid);
}

// Add Member Modal
const addMemberModal = document.getElementById('addMemberModal');

document.getElementById('addMemberBtn').addEventListener('click', () => {
    addMemberModal.style.display = 'block';
});

document.querySelector('.close').addEventListener('click', () => {
    addMemberModal.style.display = 'none';
});

document.getElementById('confirmAddMember').addEventListener('click', async () => {
    const username = document.getElementById('memberUsername').value;
    
    if (!username) {
        alert('Please enter a username');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/add-member-to-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, username }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Member added successfully');
            addMemberModal.style.display = 'none';
            loadGroup();
        } else {
            alert(data.error || 'Failed to add member');
        }
    } catch (error) {
        console.error('Add member error:', error);
        alert('Failed to add member');
    }
});

// Initialize
loadGroup();