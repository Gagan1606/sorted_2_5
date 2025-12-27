const API_BASE = '/api';

const profilePhotoInput = document.getElementById('profilePhoto');
const previewContainer = document.getElementById('preview-container');

// Preview profile photo
profilePhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Profile Preview">`;
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const password = document.getElementById('password').value;
    const profilePhoto = document.getElementById('profilePhoto').files[0];
    
    if (!profilePhoto) {
        alert('Please upload a profile photo');
        return;
    }
    
    const formData = new FormData();
    formData.append('username', username);
    formData.append('phoneNumber', phoneNumber);
    formData.append('password', password);
    formData.append('profilePhoto', profilePhoto);
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';
    
    try {
        const response = await fetch(`${API_BASE}/signup`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Account created successfully!');
            window.location.href = 'home.html';
        } else {
            alert(data.error || 'Signup failed');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('Signup failed. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up';
    }
});