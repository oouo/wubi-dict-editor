const {app, BrowserWindow, Menu, ipcMain, ipcRenderer} = require('electron');

const url = require("url");
const path = require("path");



let mainWindow

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    mainWindow.loadURL(
        url.format({
            pathname: path.join(__dirname, `index.html`),
            protocol: "file:",
            slashes: true
        })
    )
    mainWindow.on('closed', function () {
        mainWindow = null
    })

    mainWindow.webContents.openDevTools()
}

function createMenu() {
    let menu = Menu.buildFromTemplate([
        {
            label: '文件',
            submenu: [
                {
                    label: '主文件',
                    click() {
                    }
                },
                {
                    label: '用户词库',
                    click() {
                        readFile()
                    }
                },
            ]
        }
    ])
    Menu.setApplicationMenu(menu)
}

console.log(app);
app.on('ready', ()=>{
    createWindow()
    createMenu()
})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})




app.on('activate', function () {
    if (mainWindow === null) {
        createWindow()
    }
})


const fs = require('fs')
function readFile(){
    let file = 'wubi86_jidian_user.dict.yaml'
    let fileFolder = 'C:/Users/Administrator/AppData/Roaming/Rime/'
    fs.readFile(fileFolder + file, {encoding: 'utf-8'}, (err, res) => {
        if(err){
            console.log(err)
        } else {
            mainWindow.webContents.send('fileHasRead', res)
            console.log(res)
        }
    })
}