import { readFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const projects = JSON.parse(readFileSync('projects.json', 'utf8'));
mkdirSync('dist', {recursive:true});
for (const name of ['index.html','favicon.svg','app.js','projects.json']) copyFileSync(name,path.join('dist',name));
mkdirSync(path.join('dist','.openai'), {recursive:true});
copyFileSync(path.join('.openai','hosting.json'),path.join('dist','.openai','hosting.json'));
mkdirSync(path.join('dist','My Papers'), {recursive:true});
for (const p of projects) {
  if (!/^[a-z0-9-]+$/.test(p.folder)) throw new Error('Invalid project folder');
  const target = path.join('dist','projects',p.folder); mkdirSync(target,{recursive:true});
  copyFileSync(path.join('projects',p.folder,'README.md'),path.join(target,'README.md'));
  for (const [,file] of p.materials) {
    if (path.basename(file)!==file) throw new Error('Invalid source file');
    const source = path.join('My Papers',file), output = path.join('dist','My Papers',file);
    try { chmodSync(output, 0o644); } catch {}
    copyFileSync(source,output);
  }
}
console.log(`Built ${projects.length} projects with verified source files. Personal notes stay local.`);
