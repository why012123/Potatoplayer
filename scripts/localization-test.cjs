const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
test('Rendered JSX copy uses translations, including labels and placeholders',()=>{
 const untranslated=[];
 function scan(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,file.name);if(file.isDirectory())scan(p);else if(p.endsWith('.tsx')){
  const source=ts.createSourceFile(p,fs.readFileSync(p,'utf8'),99,true,ts.ScriptKind.TSX);
  function visit(n,inJsx=false,translated=false){
   const jsx=inJsx||ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n);
   const localized=translated||(ts.isCallExpression(n)&&/^(tr|lx|pickText)$/.test(n.expression.getText(source)))||(ts.isPropertyAssignment(n)&&n.name.getText(source)==='zh');
   if(jsx&&!localized&&(ts.isJsxText(n)||ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))&&/\p{Script=Han}/u.test(n.text)&&!['中文','宇多田ヒカル'].includes(n.text.trim()))untranslated.push(`${p}:${source.getLineAndCharacterOfPosition(n.getStart()).line+1} ${n.text.trim()}`);
   ts.forEachChild(n,child=>visit(child,jsx,localized));
  }visit(source);
 }}}scan(path.resolve(__dirname,'../src'));assert.deepEqual(untranslated,[]);
});
