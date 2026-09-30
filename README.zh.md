# 中文部署手册（Message Wall dApp）

照着做即可，全程约 15 分钟。这个 DApp 是**新写的**（不是 `simple-storage-dapp` 的复制），
用到了教程第 3～4 周的 Solidity 知识点，并且针对**手机（HP）**做了优化。

整体流程：

```
① Remix 部署合约到 Sepolia  →  ② 代码上传 GitHub  →  ③ Render 部署网站  →  ④ 手机 MetaMask 打开使用
```

> 顺序很重要：**先部署合约**，因为 Render 需要合约地址。

---

## 0. 先准备四样东西

| 准备项 | 说明 |
| --- | --- |
| GitHub 账号 | <https://github.com/signup>（免费） |
| Render 账号 | <https://dashboard.render.com> — 直接用 GitHub 登录最省事 |
| MetaMask | 电脑装浏览器插件，手机装 App |
| Sepolia 测试币 | 免费领，用来付 gas |

---

## 1. 部署合约到 Sepolia（Remix）

### 1.1 先领免费的测试币

1. 打开 MetaMask，确认网络列表里有 **Sepolia**（没有就手动添加）。
2. 复制你的钱包地址（`0x` 开头那串）。
3. 打开任一水龙头领取：
   * <https://www.alchemy.com/faucets/ethereum-sepolia>（需登录，建议用这个）
   * <https://cloud.google.com/application/web3/faucet/ethereum/sepolia>
4. 粘贴地址领取 0.5 SepoliaETH，等 1 分钟左右到账。

### 1.2 在 Remix 编译并部署

1. 打开 <https://remix.ethereum.org>。
2. 左侧 **File Explorer** → 展开 `contracts` 文件夹 → 新建文件，命名为 `MessageWall.sol`。
3. 把本地这个文件的**全部内容**复制粘贴进去：

   ```
   /Users/ming_yu/Downloads/message-wall-dapp/contracts/MessageWall.sol
   ```

4. 左侧点 **Solidity Compiler**：
   * **COMPILER** 下拉选 `0.8.26`
   * 点 **Compile MessageWall.sol**
   * 左侧出现绿色对勾 = 编译成功（本合约无警告）
5. 左侧点 **Deploy & Run Transactions**：
   * **ENVIRONMENT** 选 `Injected Provider - MetaMask`
   * MetaMask 弹窗 → 连接账号 → 确认当前网络是 **Sepolia**
   * **CONTRACT** 选 `MessageWall`（Constructor 无参数）
   * 点橙色 **Deploy** 按钮 → MetaMask 里确认交易
6. 部署成功后，页面下方 **Deployed Contracts** 区域展开，点右侧复制图标复制合约地址：
   * 形如 `0x1a2b3c...9f8e`，共 **42 个字符**
   * 👉 **把这个地址记下来，第 3 步要用**
   * 部署用的那个钱包就是 **owner**（只有它能清空留言墙）

可以在 <https://sepolia.etherscan.io> 粘贴地址查看合约，确认部署成功。

---

## 2. 把代码上传到 GitHub

本地仓库我已经建好了（分支 `main`，已有提交，26 个文件，约 1.3 MB）。

1. 打开 <https://github.com/new> 新建空仓库：
   * **Repository name**：`message-wall-dapp`
   * Public / Private 都可以
   * ⚠️ **不要**勾选 "Add a README file"、"Add .gitignore"、"Choose a license"（要留空仓库）
   * 点 **Create repository**
2. 在终端执行下面命令（把 `<你的用户名>` 换成你的 GitHub 用户名）：

```bash
cd /Users/ming_yu/Downloads/message-wall-dapp
git remote add origin https://github.com/<你的用户名>/message-wall-dapp.git
git push -u origin main
```

3. 如果弹出要密码：
   * GitHub 现在**不接受账号密码**，要用 **Personal Access Token**
   * 生成路径：GitHub → 右上头像 → Settings → Developer settings → Personal access tokens
     → Tokens (classic) → Generate new token → 勾 `repo` → 生成后复制，粘贴到密码位置
4. 刷新 GitHub 仓库页面，能看到 `app.py`、`render.yaml`、`contracts/` 等文件就成功了。

---

## 3. 在 Render 部署网站

1. 打开 <https://dashboard.render.com>，用 GitHub 账号登录。
2. 右上角 **New** → 选 **Blueprint**。
3. 选择你的 `message-wall-dapp` 仓库 → **Connect**。
4. Render 会自动读取仓库里的 `render.yaml`，然后让你填两个环境变量：
   * `CONTRACT_ADDRESS` → **粘贴第 1 步复制的合约地址**
   * `SEPOLIA_RPC_URL` → **留空**即可（程序自带 4 个已验证的公共节点）
5. 点 **Apply** / **Create**，等 2～3 分钟，状态变成 **Live** 就好了。

> 如果 Render 要求绑定银行卡，那只是身份验证，选择 **Free** 实例本身**不收费**。
> 万一你不想绑卡，告诉我，我可以改成纯静态版（无需 Flask 服务器）放到 GitHub Pages / Netlify。

---

## 4. 验证部署成功

浏览器打开：

```
https://<你的服务名>.onrender.com/health
```

应该返回：

```json
{"contractConfigured": true, "status": "ok"}
```

`contractConfigured` 是 `true` 就说明合约地址已经配好了。

---

## 5. 在手机（HP）上使用

1. 手机安装 **MetaMask App**，导入和第 1 步同一个钱包（这样才有测试币可以付 gas）。
2. 打开 MetaMask → 左上角 **☰** → 选 **Browser**（内置浏览器）。
3. 在地址栏输入你的 Render 网址：`https://<你的服务名>.onrender.com`
   * ⚠️ 必须用 MetaMask 内置浏览器，用 Safari / Chrome 只能看，不能发帖（没有钱包）
4. 点 **Connect wallet** → MetaMask 确认。
5. 在输入框写留言 → 点 **Post message** → MetaMask 确认交易 → 等几秒。
6. 留言会出现在墙的最上面，并带 **You** 标记。

**想清空留言墙**：只有 owner 钱包能看到 **Clear the whole wall** 按钮可用。

---

## 6. 以后想改合约地址怎么办

两种方式，任选其一：

* **不用重新部署**：在网页底部展开 **Settings**，粘贴新地址，点 **Save on this device**（只对当前浏览器生效）。
* **对所有人生效**：Render → 你的服务 → **Environment** → 修改 `CONTRACT_ADDRESS` → 保存，会自动重新部署。

---

## 命令速查（可选，本地开发用）

```bash
cd /Users/ming_yu/Downloads/message-wall-dapp

# 本地跑起来看看（不需要区块链也能看到界面）
./.venv/bin/gunicorn app:app --bind 127.0.0.1:5099

# 代码有改动后重新提交
git add -A && git commit -m "说明你改了什么" && git push
```

更多（编译合约、跑测试）见英文 `README.md` 的 Tests 章节。

---

## 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 第一次打开要等约 1 分钟 | Render 免费实例闲置 15 分钟会休眠，冷启动较慢，刷新一次即可。 |
| 提示找不到合约 / 读不到数据 | 合约地址填错，或钱包网络不是 Sepolia。 |
| 提示 gas 不够 | 去水龙头领 Sepolia 测试币。 |
| 提示只有 owner 才能操作 | 清空留言墙只允许**部署合约的那个钱包**。 |
| 手机上点连接没反应 | 你用的是普通浏览器，要改用 MetaMask 的 **Browser**。 |
| 能看留言但发不出去 | 读取不需要钱包，发帖必须钱包签名并付 gas。 |
| Remix 编译报错 | 确认 COMPILER 选的是 `0.8.26`，且文件内容完整粘贴。 |
| `git push` 要求密码 | 用 Personal Access Token 代替密码（见第 2 步第 3 点）。 |
| Render 显示 Live 但页面 500 | 看 Render 的 **Logs** 标签页，多半是环境变量名写错了。 |
| 留言墙不刷新 | 点 **Refresh**；或在 Settings 里换一个 RPC 节点。 |

---

## 注意

* 留言墙是**公开**的，任何人只要有测试币就能留言，内容永久留在 Etherscan 上，**不要发隐私内容**。
* 字数限制是 **200 字节**（不是 200 个字符），中文和 emoji 占多个字节，界面上有实时计数。
* 这是测试网项目，合约未经审计，**不要放任何真实资产**。
