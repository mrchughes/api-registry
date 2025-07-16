const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '../../storage');

async function initGitRepo() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(path.join(STORAGE_DIR, '.git'))) {
    await git.init({ fs, dir: STORAGE_DIR });
    
    // Set default git config for commits
    await git.setConfig({
      fs,
      dir: STORAGE_DIR,
      path: 'user.name',
      value: 'API Registry Service'
    });
    
    await git.setConfig({
      fs,
      dir: STORAGE_DIR,
      path: 'user.email',
      value: 'api-registry@example.com'
    });
    
    // Initial commit to establish the repository
    try {
      const initialReadmePath = path.join(STORAGE_DIR, 'README.md');
      fs.writeFileSync(
        initialReadmePath,
        '# API Specifications Storage\n\nThis directory contains API specifications managed by the API Registry Service.\n'
      );
      
      await git.add({ fs, dir: STORAGE_DIR, filepath: 'README.md' });
      await git.commit({
        fs,
        dir: STORAGE_DIR,
        message: 'Initial commit',
        author: {
          name: 'API Registry Service',
          email: 'api-registry@example.com'
        }
      });
      
      console.log('Git repository initialized successfully');
    } catch (error) {
      console.error('Failed to create initial commit:', error);
    }
  }
}

module.exports = initGitRepo;
