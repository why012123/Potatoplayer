# pets —— 桌宠素材（本地目录，不进公开仓库）

`pets/rosmontis/` 是**迷迭香桌宠**的帧序列（基建 Spine 模型离线烘焙的 PNG，带透明通道），
播放器从 `pets/<角色>/` 读它。

```
pets/rosmontis/
├── meta.json          # 每段动作的帧率/帧数/画布尺寸（烘焙脚本生成）
├── relax/000.png …    # 待机（Relax，8 秒循环）
├── move/000.png …     # 走动（Move）
├── interact/000.png … # 点一下（Interact）
├── sit/000.png …      # 坐下（Sit）
└── sleep/000.png …    # 睡觉（Sleep）
```

## 为什么不在仓库里

素材是《明日方舟》基建模型（Spine 3.5.51），**版权归鹰角网络所有**，只能本地个人使用，
所以 `.gitignore` 排除了整个 `pets/`。仓库里只有代码和烘焙脚本。

## 怎么重新生成

```bash
# 需要 Node 20+，以及 rhodes-containment-protocol 里装好的 playwright/Chromium
node tools/bake-pet.mjs "/path/to/rhodes-containment-protocol" pets/rosmontis
```

脚本会用那个仓库自带的 Spine 3.5 canvas 运行时（`public/vendor/spine-canvas-3.5.js`
+ `public/js/spine-binary-3.5.js`）把基建模型的 `Relax / Move / Interact / Sit / Sleep`
逐帧渲染成 PNG：每段动作一块画布（站立不被「躺下」的包围盒拖小），统一缩放（宽 200px），
默认 10~15fps（桌宠够用，也省内存）。

## 素材缺失时

播放器设置页会显示找不到素材的提示；桌宠不会出场，其它功能不受影响。
也可以用 `-Dpotato.petDir=/path/to/pets/rosmontis` 或配置项 `pet_dir` 指向别处。
