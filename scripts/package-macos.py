#!/usr/bin/env python3
"""Build a self-contained native-architecture .app, DMG and installer PKG.
Uses the installed Electron, JDK, VLC, Homebrew audio engines and API packages.
Never copies user preferences, credentials or music. No signing identity needed.
"""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
ARCH = subprocess.check_output(['uname', '-m'], text=True).strip()
OUT = ROOT / 'release'
STAGE = OUT / f'macos-{ARCH}'
APP = STAGE / 'PotatoMusicAI.app'
RES = APP / 'Contents/Resources'
PAYLOAD = RES / 'app'
RUNTIME = PAYLOAD / 'runtime'
LIB = RUNTIME / 'lib'
NOTICES = RES / 'ThirdPartyLicenses'


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def output(*args):
    return subprocess.check_output([str(a) for a in args], text=True)


def copy(src, dst):
    src, dst = Path(src), Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, dst, symlinks=True, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('.git', '.DS_Store', '.env', '.env.*',
                                                     '.auth-state', 'logs', '*.log', '*.cookie',
                                                     'netease_cookie.txt'))
    else:
        shutil.copy2(src, dst)


def macho(file):
    if file.is_symlink() or not file.is_file():
        return False
    with file.open('rb') as stream:
        return stream.read(4) in (b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf',
                                  b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca')


# Resolve and rewrite every non-system dependency, including transitive dylibs.
seen = {}
min_os = (13, 0)


def bundle_binary(source, dest):
    global min_os
    source, dest = Path(source).resolve(), Path(dest)
    if dest in seen:
        if seen[dest] != source:
            raise RuntimeError(f'Dylib basename collision: {dest}')
        return
    seen[dest] = source
    if source != dest.resolve():
        copy(source, dest)
    os.chmod(dest, dest.stat().st_mode | 0o200)
    info = output('otool', '-l', source)
    versions = re.findall(r'\bminos (\d+(?:\.\d+)+)', info)
    for version in versions:
        min_os = max(min_os, tuple(map(int, version.split('.'))))
    rpaths = re.findall(r'cmd LC_RPATH\s+cmdsize \d+\s+path (.*?) \(offset', info)
    deps = [line.strip().split(' (compatibility')[0] for line in output('otool', '-L', source).splitlines()[1:] if ' (compatibility' in line]
    install_ids = output('otool', '-D', source).splitlines()[1:]
    changes = []
    for dep in dict.fromkeys(deps):
        if dep in install_ids:
            continue
        if dep.startswith(('/System/', '/usr/lib/')):
            continue
        def expand(value):
            executable_dir = next((p for p in source.parents if p.name == 'MacOS'), source.parent)
            return value.replace('@loader_path', str(source.parent)).replace('@executable_path', str(executable_dir))
        candidate = Path(expand(dep))
        if dep.startswith('@rpath/'):
            candidates = [Path(expand(rp)) / dep[len('@rpath/'):] for rp in rpaths]
            candidates.extend([source.parent / dep[len('@rpath/'):], source.parent.parent / 'lib' / dep[len('@rpath/'):]])
            candidate = next((p for p in candidates if p.exists()), candidate)
        if candidate.exists() and candidate.resolve() == source:
            continue  # dylib install ID
        if not candidate.exists():
            raise RuntimeError(f'Unresolved native dependency: {source}: {dep}')
        target = LIB / candidate.name
        bundle_binary(candidate, target)
        relative = os.path.relpath(target, dest.parent)
        changes.extend(['-change', dep, '@loader_path/' + relative])
    if dest.suffix == '.dylib':
        changes.extend(['-id', '@loader_path/' + dest.name])
    if changes:
        run('install_name_tool', *changes, dest, stderr=subprocess.DEVNULL)
    # Preserve Homebrew licensing alongside copied libraries.
    parts = source.parts
    if 'Cellar' in parts:
        i = parts.index('Cellar')
        package_root = Path(*parts[:i + 3])
        for item in package_root.iterdir():
            if item.name.lower().startswith(('license', 'copying', 'notice', 'authors')):
                copy(item, NOTICES / parts[i + 1] / item.name)


def main():
    if ARCH != 'arm64':
        raise SystemExit('This packaging recipe currently targets the installed Apple Silicon runtime.')
    OUT.mkdir(exist_ok=True)
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir()
    print('[package] assembling Electron app', flush=True)
    run('ditto', ROOT / 'node_modules/electron/dist/Electron.app', APP)
    for file in ['default_app.asar', 'electron.icns']:
        (RES / file).unlink(missing_ok=True)
    copy(ROOT / 'build/icon.icns', RES / 'PotatoMusicAI.icns')
    for item in ['electron', 'dist', 'build/icon.png', 'build/media-remote',
                 'backend/target/potatoplayer-super-backend.jar', 'backend/target/lib']:
        copy(ROOT / item, PAYLOAD / item)
    # Do not reuse a cached helper built for a newer host OS.
    run('swiftc', '-O', '-target', 'arm64-apple-macos15.5', '-module-cache-path', OUT / '.swift-cache',
        ROOT / 'native/media-remote/main.swift', '-framework', 'AppKit', '-framework', 'MediaPlayer',
        '-o', PAYLOAD / 'build/media-remote/PotatoplayerMedia.app/Contents/MacOS/PotatoplayerMedia')
    pkg = json.loads((ROOT / 'package.json').read_text())
    pkg = {k: pkg[k] for k in ['name', 'version', 'description', 'main', 'type']}
    (PAYLOAD / 'package.json').write_text(json.dumps(pkg, indent=2) + '\n')
    copy(ROOT / 'node_modules/electron/dist/LICENSE', NOTICES / 'Electron-LICENSE')
    copy(ROOT / 'node_modules/electron/dist/LICENSES.chromium.html', NOTICES / 'LICENSES.chromium.html')

    # Build Ultra in an isolated directory, with sample content rather than the
    # developer's personal library. Keep the working tree's content untouched.
    print('[package] building clean Ultra assets', flush=True)
    with tempfile.TemporaryDirectory(prefix='potato-ultra-') as tmp:
        ultra = Path(tmp) / 'ultra'
        shutil.copytree(ROOT / 'ultra-rhine', ultra,
                        ignore=shutil.ignore_patterns('node_modules', 'dist', '.git', 'release', 'verification'))
        (ultra / 'node_modules').symlink_to(ROOT / 'ultra-rhine/node_modules')
        shutil.rmtree(ultra / 'public/archives', ignore_errors=True)
        env = {**os.environ, 'POTATOMUSIC_LIBRARY': str(Path(tmp) / 'no-personal-library.json')}
        run('npm', 'run', 'build', cwd=ultra, env=env)
        copy(ultra / 'dist', PAYLOAD / 'ultra-rhine/dist')

    print('[package] embedding Java and audio runtimes', flush=True)
    java_home = Path(os.environ.get('JAVA_HOME') or output('/usr/libexec/java_home').strip())
    run(java_home / 'bin/jlink', '--add-modules', 'java.se,jdk.crypto.ec,jdk.unsupported',
        '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=2',
        '--output', RUNTIME / 'java')
    vlc = Path(os.environ.get('VLC_APP', '/Applications/VLC.app')) / 'Contents/MacOS'
    for directory in ['lib', 'plugins', 'share']:
        copy(vlc / directory, RUNTIME / 'vlc' / directory)
    # These are VLC's standalone GUI/update/notification modules, not libVLC
    # playback modules. Their app-specific Sparkle/Growl frameworks aren't used.
    gui_plugins = {'libmacosx_plugin.dylib', 'libosx_notifications_plugin.dylib'}
    for name in gui_plugins:
        (RUNTIME / 'vlc/plugins' / name).unlink(missing_ok=True)
    copy(vlc.parent / 'Resources/English.lproj/COPYING.rtf', NOTICES / 'VLC-COPYING.rtf') if (vlc.parent / 'Resources/English.lproj/COPYING.rtf').exists() else None
    for name, source in [('potatohq', ROOT / 'engines/potatoHQ/build/potatohq'),
                         ('mpv', shutil.which('mpv')), ('node', shutil.which('node'))]:
        if not source:
            raise RuntimeError(f'{name} is required on the build machine')
        bundle_binary(source, RUNTIME / 'bin' / name)
    # VLC has relative plugin dependencies; resolve them against the source tree.
    for directory in ['lib', 'plugins']:
        for source in (vlc / directory).rglob('*'):
            if source.name not in gui_plugins and macho(source):
                bundle_binary(source, RUNTIME / 'vlc' / source.relative_to(vlc))

    print('[package] embedding clean music API packages', flush=True)
    netease = Path(os.environ.get('NETEASE_API_DIR') or next((ROOT.parent / 'api').glob('api-enhanced*')))
    for item in ['app.js', 'server.js', 'main.js', 'index.js', 'index.mjs', 'generateConfig.js', 'package.json',
                 'LICENSE', 'module', 'util', 'plugins', 'public', 'data', 'node_modules']:
        copy(netease / item, RUNTIME / 'api/netease' / item)
    qq = Path(os.environ.get('QQ_API_DIR', Path.home() / '.potatoplayer-super/api/qq-music-api'))
    for item in ['package.json', 'node_modules']:
        copy(qq / item, RUNTIME / 'api/qq' / item)
    for file in APP.rglob('*'):
        if file.is_symlink() and not str(file.resolve()).startswith(str(APP.resolve()) + '/'):
            raise RuntimeError(f'External symlink in package: {file}')

    plist_path = APP / 'Contents/Info.plist'
    info = plistlib.loads(plist_path.read_bytes())
    info.update(CFBundleDisplayName='PotatoMusicAI', CFBundleName='PotatoMusicAI',
                CFBundleExecutable='PotatoMusicAI', CFBundleIdentifier='com.potatomusic.ai',
                CFBundleIconFile='PotatoMusicAI.icns', CFBundleShortVersionString=VERSION,
                CFBundleVersion=VERSION, LSApplicationCategoryType='public.app-category.music',
                LSMinimumSystemVersion='.'.join(map(str, min_os)))
    info.pop('ElectronAsarIntegrity', None)
    plist_path.write_bytes(plistlib.dumps(info))
    (APP / 'Contents/MacOS/Electron').rename(APP / 'Contents/MacOS/PotatoMusicAI')
    for helper in (APP / 'Contents/Frameworks').glob('*.app/Contents/Info.plist'):
        helper_info = plistlib.loads(helper.read_bytes())
        helper_info['CFBundleIdentifier'] = helper_info['CFBundleIdentifier'].replace('com.github.Electron', 'com.potatomusic.ai')
        helper_info['CFBundleDisplayName'] = helper_info.get('CFBundleName', 'Electron Helper').replace('Electron', 'PotatoMusicAI')
        helper.write_bytes(plistlib.dumps(helper_info))
    manifest = {'version': VERSION, 'architecture': ARCH, 'minimumMacOS': info['LSMinimumSystemVersion'],
                'signing': 'ad-hoc; not notarized', 'nativeLibraries': len(seen)}
    (RES / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    finalize()


def finalize():
    global STAGE, APP, RES
    original_stage = STAGE
    # File Provider folders (including synced Desktops) can reattach FinderInfo
    # while signing. Finish on a local temporary volume, then copy back results.
    STAGE = Path(tempfile.mkdtemp(prefix='potato-sign-', dir='/private/tmp'))
    original_app = APP
    APP = STAGE / 'PotatoMusicAI.app'
    RES = APP / 'Contents/Resources'
    shutil.copytree(original_app, APP, symlinks=True, copy_function=shutil.copy)
    # Relocation/signing changes plugin metadata; let libVLC discover it afresh.
    (RES / 'app/runtime/vlc/plugins/plugins.dat').unlink(missing_ok=True)
    info = plistlib.loads((APP / 'Contents/Info.plist').read_bytes())
    manifest = json.loads((RES / 'build-manifest.json').read_text())
    print('[package] signing nested code and app (ad hoc)', flush=True)
    run('chmod', '-R', 'u+w', APP)
    run('xattr', '-cr', APP)
    # Sign each native file after relocation, then nested bundles from inside out.
    for file in APP.rglob('*'):
        if macho(file):
            run('codesign', '--force', '--sign', '-', file, stderr=subprocess.DEVNULL)
    bundles = [p for p in APP.rglob('*') if p.is_dir() and p.suffix in ['.app', '.framework']]
    for bundle in sorted(bundles, key=lambda p: len(p.parts), reverse=True):
        run('codesign', '--force', '--sign', '-', bundle, stderr=subprocess.DEVNULL)
    run('codesign', '--force', '--sign', '-', APP, stderr=subprocess.DEVNULL)
    run('codesign', '--verify', '--deep', '--strict', APP)
    # Smoke-test the exact signed app before producing distributable installers.
    run('node', ROOT / 'scripts/package-smoke.cjs', APP, cwd=ROOT)
    run('codesign', '--verify', '--deep', '--strict', APP)
    print('[package] creating DMG and PKG', flush=True)
    if not (STAGE / 'Applications').is_symlink():
        (STAGE / 'Applications').symlink_to('/Applications')
    (STAGE / '安装说明.txt').write_text(
        f'PotatoMusicAI {VERSION} — Apple Silicon\n\n'
        f'系统要求：macOS {info["LSMinimumSystemVersion"]} 或更高版本。\n'
        '把 PotatoMusicAI.app 拖入 Applications 即可安装。\n'
        '内置 Java、VLC、potatoHQ、mpv、Node 与音乐 API；不需要安装开发工具。\n'
        '本构建使用本地临时签名，未经 Apple 公证。若系统拦截，请在系统设置 → 隐私与安全性中允许打开。\n'
        '个人曲库和登录数据不包含在安装包中，在线功能仍需要联网和相应账号。\n', encoding='utf-8')
    prefix = f'PotatoMusicAI-{VERSION}-macOS-{ARCH}'
    dmg, pkg_file = OUT / (prefix + '.dmg'), OUT / (prefix + '.pkg')
    run('hdiutil', 'create', '-ov', '-volname', f'PotatoMusicAI {VERSION}', '-srcfolder', STAGE,
        '-format', 'UDZO', dmg)
    with tempfile.TemporaryDirectory(prefix='potato-pkg-') as tmp:
        components = Path(tmp) / 'components.plist'
        components.write_bytes(plistlib.dumps([{'RootRelativeBundlePath': 'PotatoMusicAI.app',
            'BundleIsRelocatable': False, 'BundleHasStrictIdentifier': True,
            'BundleIsVersionChecked': True, 'BundleOverwriteAction': 'upgrade'}]))
        payload = Path(tmp) / 'payload'
        payload.mkdir()
        shutil.copytree(APP, payload / APP.name, symlinks=True, copy_function=shutil.copy)
        run('pkgbuild', '--root', payload, '--component-plist', components,
            '--install-location', '/Applications', '--identifier', 'com.potatomusic.ai',
            '--version', VERSION, pkg_file)
    run('hdiutil', 'verify', dmg)
    (OUT / 'SHA256SUMS.txt').write_text(''.join(
        f'{hashlib.file_digest(p.open("rb"), "sha256").hexdigest()}  {p.name}\n' for p in [dmg, pkg_file]))
    print(json.dumps(manifest, indent=2), flush=True)
    print(f'[package] ready: {dmg}\n[package] ready: {pkg_file}', flush=True)
    shutil.rmtree(original_app)
    copy(STAGE / '安装说明.txt', original_stage / '安装说明.txt')
    shutil.rmtree(STAGE)


if __name__ == '__main__':
    finalize() if '--finish' in sys.argv else main()
