import Dict from "./Dict.mjs"
import {shakeDom, shakeDomFocus} from "./Utility.mjs"
import Word from "./Word.mjs";
import Vue from '../node_modules/vue/dist/vue.esm.browser.min.js'

const {ipcRenderer} = require('electron')
const {IS_IN_DEVELOP} =  require('./js/Global')
const VirtualScroller = require('vue-virtual-scroller')


// Vue 2
const app = {
    el: '#app',
    components: {RecycleScroller: VirtualScroller.RecycleScroller},
    data() {
        return {
            IS_IN_DEVELOP: IS_IN_DEVELOP, // 是否为开发模式
            tip: '', // 提示信息
            dict: {
                deep: true
            }, // 当前词库对象 Dict
            dictMain: {}, // 主码表 Dict
            keyword: '', // 搜索关键字
            code: '',
            word: '',
            activeGroupId: -1, // 组 index
            keywordUnwatch: null, // keyword watch 方法的撤消方法
            selectedWordIds: [], // 已选择的词条
            labelOfSaveBtn: '保存', // 保存按钮的文本
            heightContent: 0, // content 高度
            words: [], // 显示的 words


            dictSecond: {}, // 要移动到的码表
            showDropdown: false, // 显示移动词条窗口
            dropdownFileList: [
                // {name: '拼音词库', path: 'pinyin_simp.dict.yaml'}
            ],
            dropdownActiveFileIndex: -1, // 选中的
            dropdownActiveGroupIndex: -1, // 选中的分组 ID

            config: {} // 全局配置
        }
    },
    mounted() {
        this.heightContent = innerHeight - 47 - 20 - 10
        // 载入主要操作码表文件
        ipcRenderer.on('showFileContent', (event, filename, res) => {
            // 过滤移动到的文件列表，不显示正在显示的这个码表
            // this.dropdownFileList = this.dropdownFileList.filter(item => item.path !== filename)

            this.dict = new Dict(res, filename)
            // 载入新码表时，清除 word 保存 code
            this.word = ''
            this.refreshShowingWords()
            // this.search() // 配置项：切换码表是否自动搜索
            ipcRenderer.send('loadMainDict') // 请求主码表文件
        })
        ipcRenderer.on('saveFileSuccess', () => {
            this.labelOfSaveBtn = '保存成功'
            this.$refs.domBtnSave.classList.add('btn-green')
            setTimeout(()=>{
                this.$refs.domBtnSave.classList.remove('btn-green')
                this.labelOfSaveBtn = '保存'
            }, 2000)
        })

        // 由 window 触发获取文件目录的请求，不然无法实现适时的获取到 主进程返回的数据
        ipcRenderer.send('GetFileList')
        ipcRenderer.on('FileList', (event, fileList) => {
            if(IS_IN_DEVELOP){
                console.log(fileList)
            }
            this.dropdownFileList = fileList
        })

        ipcRenderer.send('loadInitDictFile')

        // 载入次码表
        ipcRenderer.on('setSecondDict', (event, filename, res) => {
            this.dictSecond = new Dict(res, filename)
        })

        // 载入主码表
        ipcRenderer.on('setMainDict', (event, filename, res) => {
            this.dictMain = new Dict(res, filename)
        })

        // 配置相关
        ipcRenderer.on('responseConfigFile', (event, config) => {
            this.config = config
            console.log('窗口载入时获取到的 config 文件：', config)
        })
        ipcRenderer.send('requestConfigFile')


        // 配置文件保存后，向主窗口更新配置文件内容
        ipcRenderer.on('updateConfigFile', (event, config) => {
            this.config = config
        })

        this.addKeyboardListener()
        onresize = ()=>{
            this.heightContent = innerHeight - 47 - 20 - 10
        }
    },
    computed: {
        // 当前显示的 words 数量
        wordsCount(){
            if (this.dict.isGroupMode){
                let countCurrent = 0
                this.words.forEach(group => {
                    countCurrent = countCurrent + group.dict.length
                })
                return countCurrent
            } else {
                return this.words.length
            }
        },
        // 当前载入的是否为 主 码表
        isInMainDict(){
            return this.dict.filename === 'wubi86_jidian.dict.yaml'
        }
    },

    methods: {
        // 选择移动到的分组 index
        setDropdownActiveGroupIndex(index){
            this.dropdownActiveGroupIndex = index
        },
        // 选择移动到的文件 index
        setDropdownActiveIndex(fileIndex){
            this.dropdownActiveFileIndex = fileIndex
            this.dropdownActiveGroupIndex = -1 // 切换文件列表时，复位分组 fileIndex
            // this.dictSecond = {} // 立即清空次码表，分组列表也会立即消失，不会等下面的码表加载完成再清空
            ipcRenderer.send('loadSecondDict', this.dropdownFileList[fileIndex].path) // 载入当前 index 的文件内容
        },
        sort(){
            this.dict.sort(this.activeGroupId)
            this.refreshShowingWords()
        },
        enterKeyPressed(){
            switch (this.config.enterKeyBehavior){
                case "add":this.addNewWord(); break;
                case "search": this.search(); break;
                default: break;
            }
        },
        // 通过 code, word 筛选词条
        search(){
            this.selectedWordIds = []
            this.activeGroupId = -1 // 切到【全部】标签页，展示所有搜索结果
            let startPoint = new Date().getTime()
            if (this.code || this.word){
                if (this.dict.isGroupMode){
                    this.words = []
                    this.dict.wordsOrigin.forEach(groupItem => {
                        let tempGroupItem = groupItem.clone() // 不能直接使用原 groupItem，不然会改变 wordsOrigin 的数据
                        tempGroupItem.dict = tempGroupItem.dict.filter(item => {
                            switch (this.config.searchMethod){
                                case "code": return item.code.includes(this.code);
                                case "phrase": return item.word.includes(this.word);
                                case "both": return item.code.includes(this.code) && item.word.includes(this.word)
                                case "any": return item.code.includes(this.code) || item.word.includes(this.word)
                            }
                        })
                        if (tempGroupItem.dict.length > 0){ // 当前分组中有元素，添加到结果中
                            this.words.push(tempGroupItem)
                        }
                    })
                    console.log('用时: ', new Date().getTime() - startPoint, 'ms')
                } else {
                    this.words = this.dict.wordsOrigin.filter(item => { // 获取包含 code 的记录
                        switch (this.config.searchMethod){
                            case "code": return item.code.includes(this.code);
                            case "phrase": return item.word.includes(this.word);
                            case "both": return item.code.includes(this.code) && item.word.includes(this.word)
                            case "any": return item.code.includes(this.code) || item.word.includes(this.word)
                        }
                    })
                    console.log(`${this.code} ${this.word}: ` ,'搜索出', this.words.length, '条，', '用时: ', new Date().getTime() - startPoint, 'ms')
                }

            } else { // 如果 code, word 为空，恢复原有数据
                this.refreshShowingWords()
            }
        },

        // GROUP OPERATION
        // 添加新组
        addGroupBeforeId(groupIndex){
            this.dict.addGroupBeforeId(groupIndex)
            this.refreshShowingWords()
        },
        deleteGroup(groupId){
            this.dict.deleteGroup(groupId)
            this.activeGroupId = - 1 // 不管删除哪个分组，之后都指向全部
            this.refreshShowingWords()
        },
        // 设置当前显示的 分组
        setGroupId(groupId){ // groupId 全部的 id 是 -1
            this.activeGroupId = groupId
            this.refreshShowingWords()
        },
        // 刷新 this.words
        refreshShowingWords(){
            this.selectedWordIds = []
            if (this.activeGroupId === -1){
                this.words = [...this.dict.wordsOrigin]
            } else {
                this.words = new Array(this.dict.wordsOrigin[this.activeGroupId])
            }
        },
        addNewWord(){
            if (!this.word){
                shakeDomFocus(this.$refs.domInputWord)
            } else if (!this.code){
                shakeDomFocus(this.$refs.domInputCode)
            } else {
                this.dict.addNewWord(new Word(this.dict.lastIndex, this.code, this.word) ,this.activeGroupId)
                this.refreshShowingWords()
                console.log(this.code, this.word, this.activeGroupId)
                if (this.config.autoDeploy){
                    this.saveToFile(this.dict)
                }
            }
        },
        getWordCodes(word){
            try{
                let decodeArray = [] // 每个字解码后的数组表
                let letterArray = word.split('')
                if (letterArray.length > 4){ // 只截取前三和后一
                    letterArray.splice(3,letterArray.length - 4)
                }
                letterArray.forEach(ch => {
                    decodeArray.push(this.dictMain.characterMap.get(ch) || '')
                })
                let phraseCode = ''
                switch (decodeArray.length){
                    case 0:
                    case 1:
                        break
                    case 2: // 取一的前二码，二的前二码
                        phraseCode =
                            decodeArray[0].substring(0,2) +
                            decodeArray[1].substring(0,2)
                        break
                    case 3: // 取一二前一码，三前二码
                        phraseCode =
                            decodeArray[0].substring(0,1) +
                            decodeArray[1].substring(0,1) +
                            decodeArray[2].substring(0,2)
                        break
                    default: // 取一二三前一码，最后的一码
                        phraseCode =
                            decodeArray[0].substring(0,1) +
                            decodeArray[1].substring(0,1) +
                            decodeArray[2].substring(0,1) +
                            decodeArray[decodeArray.length - 1].substring(0,1)
                }
                console.log(phraseCode, decodeArray)
                return phraseCode
            } catch(err){
                return ''
            }
        },

        // 保存内容到文件
        saveToFile(dict){
            console.log(dict.filename)
            ipcRenderer.send('saveFile', dict.filename, dict.toYamlString())
        },
        // 选中全部展示的词条
        selectAll(){
            if(this.wordsCount < 1000){
                if (this.dict.isGroupMode){
                    this.selectedWordIds = []
                    this.words.forEach(group => {
                        this.selectedWordIds = this.selectedWordIds.concat(group.dict.map(item => item.id))
                    })
                } else {
                    this.selectedWordIds = this.words.map(item => item.id)
                }
            } else {
                // 提示不能同时选择太多内容
                this.tip = '不能同时选择大于 1000条 的词条内容'
                shakeDom(this.$refs.domBtnSelectAll)
            }
        },
        // 清除内容
        resetInputs(){
            this.code = ''
            this.word = ''
            this.selectedWordIds = []
            this.search()
            this.tip = ''
        },
        // 删除词条：单
        deleteWord(wordId){
            this.selectedWordIds = this.selectedWordIds.filter(item => item !== wordId)
            this.dict.deleteWords([wordId])
            this.refreshShowingWords()
        },
        // 删除词条：多
        deleteWords(){
            this.dict.deleteWords(this.selectedWordIds)
            this.refreshShowingWords()
            this.selectedWordIds = [] // 清空选中 wordID
        },

        // 词条位置移动
        move(wordId, direction){
            if (this.dict.isGroupMode){
                // group 时，移动 调换 word 位置，是直接调动的 wordsOrigin 中的word
                // 因为 group 时数据为： [{word, word},{word,word}]，是 wordGroup 的索引
                for(let i=0; i<this.words.length; i++){
                    let group = this.words[i]
                    for(let j=0; j<group.dict.length; j++){
                        if (wordId === group.dict[j].id){
                            let tempItem = group.dict[j]
                            if (direction === 'up'){
                                if (j !==0){
                                    group.dict[j] = group.dict[j - 1]
                                    group.dict[j - 1] = tempItem
                                    return ''
                                } else {
                                    console.log('已到顶')
                                    return '已到顶'
                                }
                            } else if (direction === 'down'){
                                if (j+1 !== group.dict.length){
                                    group.dict[j] = group.dict[j + 1]
                                    group.dict[j + 1] = tempItem
                                    return ''
                                } else {
                                    console.log('已到底')
                                    return '已到底'
                                }
                            }
                        }
                    }
                }
            } else {
                // 非分组模式时，调换位置并不能直接改变 wordsOrigin 因为 与 words 已经断开连接
                // [word, word]
                for(let i=0; i<this.words.length; i++){
                    if (wordId === this.words[i].id){
                        let tempItem = this.words[i]
                        if (direction === 'up'){
                            if (i !==0) {
                                this.dict.exchangePositionInOrigin(tempItem, this.words[i-1]) // 调换 wordsOrigin 中的词条位置
                                this.words[i] = this.words[i - 1]
                                this.words[i - 1] = tempItem
                                return ''
                            } else {
                                console.log('已到顶')
                                return '已到顶'
                            }
                        } else if (direction === 'down'){
                            if (i+1 !== this.words.length) {
                                this.dict.exchangePositionInOrigin(tempItem, this.words[i+1]) // 调换 wordsOrigin 中的词条位置
                                this.words[i] = this.words[i + 1]
                                this.words[i + 1] = tempItem
                                return ''
                            } else {
                                console.log('已到底')
                                return '已到底'
                            }
                        }
                    }
                }
            }
        },

        // 上移词条
        moveUp(id){
            this.tip = this.move(id, 'up')
            let temp = this.words.pop()
            this.words.push(temp)
        },
        // 下移词条
        moveDown(id){
            this.tip = this.move(id, 'down')
            let temp = this.words.pop()
            this.words.push(temp)
        },
        // 判断是否为第一个元素
        isFirstItem(id){
            if (this.dict.isGroupMode){ // 分组时的第一个元素
                for (let i=0; i<this.words.length; i++) {
                    for (let j = 0; j < this.words[i].dict.length; j++) {
                        if (this.words[i].dict[j].id === id){
                            return j === 0 // 使用 array.forEach() 无法跳出循环
                        }
                    }
                }
                return false
            } else {
                for (let i = 0; i < this.words.length; i++) {
                    if (this.words[i].id === id){
                        return i === 0 // 使用 array.forEach() 无法跳出循环
                    }
                }
                return false
            }
        },
        // 判断是否为最后一个元素
        isLastItem(id){
            if (this.dict.isGroupMode){ // 分组时的最后一个元素
                for (let i=0; i<this.words.length; i++) {
                    for (let j = 0; j < this.words[i].dict.length; j++) {
                        if (this.words[i].id === id){
                            return j + 1 === this.words.length
                        }
                    }
                }
                return false
            } else {
                for (let i = 0; i < this.words.length; i++) {
                    if (this.words[i].id === id){
                        return i + 1 === this.words.length
                    }
                }
                return false
            }
        },
        // 绑定键盘事件： 键盘上下控制词条上下移动
        addKeyboardListener(){
            window.addEventListener('keydown', event => {
                // console.log(event)
                switch( event.key) {
                    case 's':
                        if (event.ctrlKey || event.metaKey){ // metaKey 是 macOS 的 Ctrl
                            this.saveToFile(this.dict)
                            event.preventDefault()
                        } else {

                        }
                        break
                    case 'ArrowDown':
                        if(this.selectedWordIds.length === 1) { // 只有一个元素时，键盘才起作用
                            let id = this.selectedWordIds[0]
                            this.moveDown(id)
                        }
                        event.preventDefault()
                        break
                    case 'ArrowUp':
                        if(this.selectedWordIds.length === 1) { // 只有一个元素时，键盘才起作用
                            let id = this.selectedWordIds[0]
                            this.moveUp(id)
                        }
                        event.preventDefault()
                        break
                }
            })
        },
        // 将选中的词条移动到次码表
        moveWordsToSecondDict(){
            let wordsTransferring = [] // 被转移的 [Word]
            if (this.dict.isGroupMode){
                this.dict.wordsOrigin.forEach((group, index) => {
                    let matchedWords = group.dict.filter(item => this.selectedWordIds.includes(item.id))
                    wordsTransferring = wordsTransferring.concat(matchedWords)
                })
            } else {
                wordsTransferring = this.dict.wordsOrigin.filter(item => this.selectedWordIds.includes(item.id))
            }
            if(this.IS_IN_DEVELOP){console.log('words transferring：', JSON.stringify(wordsTransferring))}

            if (this.dict.filename === this.dictSecond.filename){
                this.dictSecond.deleteWords(this.selectedWordIds) // 删除移动的词条
                this.dictSecond.addWordsInOrder(wordsTransferring, this.dropdownActiveGroupIndex)
                if(this.IS_IN_DEVELOP) {console.log('after insert:( main:wordOrigin ):\n ', JSON.stringify(this.dictSecond.wordsOrigin))}
                // 如果在同码表中移动：如，从一个分组移到别一个分组
                // 只保存 dictSecond 内容，重新载入 dict 内容
                this.saveToFile(this.dictSecond)
                this.reloadCurrentDict()
            } else {
                this.dictSecond.addWordsInOrder(wordsTransferring, this.dropdownActiveGroupIndex)
                this.words = [...this.dict.wordsOrigin]
                if(this.IS_IN_DEVELOP) {console.log('after insert:( main:wordOrigin ):\n ', JSON.stringify(this.dictSecond.wordsOrigin))}
                this.deleteWords() // 删除当前词库已移动的词条
                this.saveToFile(this.dictSecond)
                this.saveToFile(this.dict)
            }
            this.tip = '移动成功'
            this.resetDropList()
        },
        // 复制 dropdown
        resetDropList(){
            this.showDropdown = false
            this.dropdownActiveFileIndex = -1
            this.dropdownActiveGroupIndex = -1
            this.dictSecond = {} // 清空次码表
        },
        // 打开当前码表源文件
        openCurrentYaml(){
            ipcRenderer.send('openFileOutside', this.dict.filename)
        },
        // 重新载入当前码表
        reloadCurrentDict(){
            ipcRenderer.send('loadDictFile', this.dict.filename)
        }
    },
    watch: {
        code(newValue){
            this.code = newValue.replaceAll(/[^A-Za-z ]/g, '') // input.code 只允许输入字母
        },
        word(newValue){
            this.code = this.getWordCodes(newValue)
        },
        selectedWordIds(newValue){
            if (newValue.length === 0){
                this.showDropdown = false
            }
            console.log('已选词条id: ', JSON.stringify(newValue))
        },
        showDropdown(newValue){
            if (!newValue){ // 窗口关闭时，重置 index
                this.resetDropList()
            }
        }
    }
}

new Vue(app)
