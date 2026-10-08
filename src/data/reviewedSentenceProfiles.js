// Explicit bilingual lexical decisions. These are authored examples, not
// translations inferred from a dictionary's first gloss. Unlisted words remain
// needs-review. A profile approves only the frame families it explicitly enables.
export const REVIEWED_SENTENCE_PROFILE_VERSION = '2026-10-07.1';

const profiles = new Map();

// Columns: spelling(s), Japanese complement, complete English action, flags,
// optional Japanese/English subject, optional resulting-state predicate.
// a = intentional action frames; t = transitive causative; p = ongoing aspect.
function verbs(group, lines) {
  for (const line of lines.trim().split('\n')) {
    const [spellings, ja, action, flags = '', subjectJa = '私は', subjectEn = 'I', result = ''] =
      line.trim().split('|');
    for (const dict of spellings.split('／')) {
      profiles.set(`${group}:${dict}`, {
        kind: 'verb',
        ja,
        action,
        flags,
        subjectJa: subjectJa || '私は',
        subjectEn: subjectEn || 'I',
        aspect: result || (flags.includes('p') ? 'ongoing' : ''),
        sense: action,
      });
    }
  }
}

verbs(
  'godan',
  `
会う|友だちに|meet a friend|a
遊ぶ|公園で|play in the park|ap
洗う|手を|wash my hands|atp
在る／有る||be a book on the desk||机の上に本が|There
歩く|公園を|walk through the park|ap
言う|自分の名前を|say my name|at
行く|学校へ|go to school|a|||be at school
要る||need a dictionary||私は辞書が|I
歌う|歌を|sing a song|atp
売る|本を|sell a book|atp
置く|机の上に本を|put a book on the desk|at
押す|ボタンを|press the button|at
泳ぐ|プールで|swim in the pool|ap
おわる／終る||end||授業が|the class|be over
買う|パンを|buy bread|at
返す|友だちに本を|return a book to a friend|at
帰る|家に|return home|a|||be at home
かかる||take an hour||一時間|it
書く|手紙を|write a letter|atp
貸す|友だちに本を|lend a book to a friend|at
かぶる|帽子を|put on a hat|at|||be wearing a hat
聞く|音楽を|listen to music|atp
切る|紙を|cut the paper|atp
曇る||become cloudy||空が|the sky|be cloudy
消す|電気を|turn off the light|at
困る||have a problem||私は|I
咲く||bloom||花が|the flowers|be in bloom
さす／差す|傘を|hold up an umbrella|at|||be holding up an umbrella
死ぬ||die||金魚が|the goldfish|be dead
閉まる||close||ドアが|the door|be closed
知る|その事実を|learn that fact||||know that fact
吸う|新鮮な空気を|breathe in fresh air|atp
住む|東京に|live in Tokyo|a|||be living in Tokyo
座る|椅子に|sit down on a chair|a|||be sitting on a chair
出す|先生に宿題を|hand my homework to the teacher|at
立つ|入口に|stand at the entrance|a|||be standing at the entrance
頼む|友だちに手伝いを|ask a friend for help|at
違う||be different||答えが|the answer
使う|辞書を|use a dictionary|atp
着く|駅に|arrive at the station|a|||be at the station
作る|夕食を|make dinner|atp
跳ぶ|高く|jump high|a
飛ぶ|空を|fly through the sky||鳥が|the bird|be flying through the sky
止まる||stop||電車が|the train|be stopped
撮る|写真を|take a photo|atp
取る|机から本を|take a book from the desk|at
鳴く||chirp||鳥が|the bird|be chirping
無くす|鍵を|lose my key
習う|日本語を|learn Japanese|atp
並ぶ|店の前に|line up in front of the shop|a|||be in line in front of the shop
なる|先生に|become a teacher|a
脱ぐ|上着を|take off my jacket|at
登る|山に|climb a mountain|ap
飲む|水を|drink water|atp
乗る|電車に|board the train|a|||be on the train
入る|部屋に|enter the room|a|||be in the room
はく|靴を|put on my shoes|at|||be wearing my shoes
弾く|ピアノを|play the piano|atp
始まる||begin||授業が|the class|be in progress
走る|公園で|run in the park|ap
働く|図書館で|work at the library|ap
話す|日本語を|speak Japanese|atp
貼る|壁に写真を|stick a photo on the wall|at
引く|ロープを|pull the rope|atp
開く||open||ドアが|the door|be open
吹く||blow||風が|the wind|be blowing
降る||rain||雨が|it|be raining
曲る|角を右に|turn right at the corner|a
待つ|友だちを|wait for a friend|atp
回す|ハンドルを|turn the handle|atp
磨く|歯を|brush my teeth|atp
持つ|かばんを|hold a bag|at|||be holding a bag
休む|少し|rest a little|ap
やる|宿題を|do my homework|atp
呼ぶ|友だちを|call a friend|at
読む|本を|read a book|atp
分かる||understand the explanation||私は説明が|I
渡す|友だちに本を|hand a book to a friend|at
渡る|橋を|cross the bridge|ap
合う||fit||この靴は|these shoes
上がる||rise||値段が|the price|be higher
空く||become empty||席が|the seat|be empty
集まる||gather||学生が|the students|be gathered
謝る|友だちに|apologize to a friend|a
急ぐ|駅へ|hurry to the station|ap
致す|準備を|do the preparations||私は|I
祈る|家族の幸せを|pray for my family's happiness|atp
いらっしゃる|学校に|be at school||先生が|the teacher
うかがう／伺う|先生に道を|ask the teacher for directions||私は|I
動く||move||電車が|the train|be moving
写す|ノートに文を|copy a sentence into my notebook|atp
移る|新しい家に|move to a new house|a
選ぶ|本を|choose a book|atp
送る|友だちに手紙を|send a letter to a friend|at
起こす|弟を|wake my younger brother|at
行う|実験を|conduct an experiment|atp
怒る||get angry||先生が|the teacher|be angry
おっしゃる|自分の名前を|say their name||先生が|the teacher
落す|鍵を|drop my key
踊る|舞台で|dance on the stage|ap
驚く|その知らせに|be surprised by the news
思い出す|友だちの名前を|recall a friend's name
思う|そう|think so
おる|こちらに|be here||私は|I
折る|紙を|fold the paper|atp
飾る|部屋を|decorate the room|atp
勝つ|試合に|win the match|a
かまう|猫を|pay attention to the cat|atp
噛む|食べ物を|chew my food|atp
通う|学校に|attend school|a|||be attending school
乾く||dry||洗濯物が|the laundry|be dry
変わる||change||予定が|the plan|be different
頑張る|練習で|work hard at practice|ap
決まる||be decided||予定が|the plan|be settled
くださる|私に本を|give me a book||先生が|the teacher
下る|坂を|go down the slope|ap
込む／すく||become crowded||電車が|the train|be crowded
ごらんになる|写真を|look at a photo||先生が|the teacher
壊す|古い箱を|break the old box|at
探す|鍵を|look for my key|atp
騒ぐ|教室で|make noise in the classroom|ap
触る|机に|touch the desk|a
叱る|生徒を|scold a student||先生が|the teacher
しまう|本を棚に|put a book away on the shelf|at
すく||become less crowded||道が|the road|be less crowded
進む|前に|move forward|ap
滑る|氷の上を|slide on the ice|ap
済む||be finished||仕事が|the work
足す|一を|add one|at
楽む|音楽を|enjoy music|atp
点く||come on||電気が|the light|be on
続く||continue||会議が|the meeting|be continuing
包む|贈り物を|wrap a gift|atp
釣る|魚を|catch fish|atp
手伝う|母を|help my mother|atp
通る|公園を|pass through the park|ap
泊まる|ホテルに|stay at a hotel|ap
直す|時計を|repair a clock|atp
治る||heal||傷が|the wound|be healed
直る||be repaired||時計が|the clock|be repaired
泣く||cry||子どもが|the child|be crying
亡くなる||pass away||祖父が|my grandfather
無くなる||disappear||荷物が|the luggage|be gone
なさる|準備を|do the preparations||先生が|the teacher
鳴る||ring||電話が|the phone|be ringing
盗む|お金を|steal money
塗る|壁にペンキを|apply paint to the wall|atp
眠る||sleep|ap
残る||remain||パンが|some bread|be left
運ぶ|箱を|carry a box|atp
払う|代金を|pay the bill|at
光る||shine||星が|the stars|be shining
引っ越す|東京に|move to Tokyo|a
拾う|鍵を|pick up a key|at
打つ|ボールを|hit the ball|at
太る||gain weight||||be overweight
踏む|ペダルを|press the pedal|at
参る|学校へ|go to school||私は|I
間に合う|電車に|catch the train|a
回る||rotate||車輪が|the wheel|be rotating
見つかる||be found||鍵が|the key|be found
向かう|駅に|head toward the station|ap
召し上がる|昼食を|eat lunch||先生が|the teacher
申す|自分の名前を|say my name||私は|I
戻る|家に|return home|a|||be back at home
もらう|友だちに本を|receive a book from a friend|at
焼く|パンを|bake bread|atp
役に立つ||be useful||この本は|this book
止む||stop||雨が|the rain|be over
寄る|本屋に|stop by the bookshop|a
喜ぶ|その知らせを|be delighted by the news
沸かす|お湯を|boil water|atp
沸く||boil||お湯が|the water|be boiling
笑う||laugh|ap
いただく|お茶を|drink tea||私は|I
終わる||end||授業が|the class|be over
曲がる|角を右に|turn right at the corner|a
なくす|鍵を|lose my key
履く|靴を|put on my shoes|at|||be wearing my shoes
かぶる／被る|帽子を|put on a hat|at|||be wearing a hat
込む／混む||become crowded||電車が|the train|be crowded
落とす|鍵を|drop my key
楽しむ|音楽を|enjoy music|atp
叩く|ドアを|knock on the door|at
断る|招待を|decline an invitation|at
誘う|友だちを|invite a friend|at
急ぐ|駅へ|hurry to the station|ap
守る|約束を|keep a promise|at
選ぶ|本を|choose a book|atp
減る||decrease||人数が|the number of people
増す||increase||仕事が|the workload
動かす|机を|move the desk|atp
渡す|友だちに本を|hand a book to a friend|at
渡る|橋を|cross the bridge|ap
`,
);

verbs(
  'ichidan',
  `
開ける|窓を|open the window|at
上げる|手を|raise my hand|at
浴びる|シャワーを|take a shower|atp
居る|部屋に|be in the room
入れる|かばんに本を|put a book in my bag|at
生まれる||be born||赤ちゃんが|the baby
起きる|朝六時に|get up at six in the morning|a|||be awake at six in the morning
教える|子どもに日本語を|teach Japanese to a child|atp
覚える|漢字を|memorize kanji|atp
降りる|電車を|get off the train|a
かける|友だちに電話を|call a friend|at
掛ける|壁に絵を|hang a picture on the wall|at
借りる|図書館で本を|borrow a book from the library|at
消える||disappear||明かりが|the light|be out
着る|上着を|put on my jacket|at|||be wearing my jacket
答える|質問に|answer a question|ap
締める|ベルトを|fasten my belt|at
閉める|窓を|close the window|at
食べる|昼食を|eat lunch|atp
疲れる||get tired||||be tired
つける|電気を|turn on the light|at
勤める|会社に|work for a company|a|||be working for a company
出かける|買い物に|go shopping|a
できる||be able to speak Japanese||私は日本語が|I
出る|部屋を|leave the room|a
並べる|机に本を|arrange books on the desk|atp
寝る||sleep|ap
晴れる||clear up||空が|the sky|be clear
見せる|友だちに写真を|show a photo to a friend|at
見る|映画を|watch a film|atp
忘れる|友だちの名前を|forget a friend's name
あげる|友だちに本を|give a book to a friend|at
集める|切手を|collect stamps|atp
生きる||live||この魚は|this fish|be alive
いじめる|同級生を|bully a classmate
植える|花を|plant flowers|atp
受ける|試験を|take an exam|atp
遅れる|授業に|be late for class
落る／落ちる||fall||葉が|the leaves|be on the ground
下りる|階段を|go down the stairs|ap
折れる||break||枝が|the branch|be broken
変える|予定を|change my plans|at
片付ける|部屋を|tidy the room|atp
考える|答えを|think about the answer|atp
聞こえる||be audible||音楽が|the music
決める|旅行の日を|decide on the travel date|at
比べる|二つの写真を|compare two photos|atp
くれる|私に本を|give me a book||友だちが|my friend
暮れる||come to an end||一日が|the day
壊れる||break||時計が|the clock|be broken
下げる|音量を|lower the volume|at
差し上げる|先生に本を|give a book to the teacher||私は|I
知らせる|友だちに予定を|tell a friend my plans|at
調べる|言葉の意味を|look up the meaning of a word|atp
過ぎる||pass||一時間が|an hour
捨てる|ごみを|throw away the rubbish|at
育てる|野菜を|grow vegetables|atp
尋ねる|先生に道を|ask the teacher for directions|at
訪ねる|友だちを|visit a friend|at
建てる|家を|build a house|atp
立てる|旗を|put up a flag|at
足りる||be enough||お金が|the money
倒れる||fall over||木が|the tree
捕まえる|虫を|catch an insect|at
漬ける|野菜を|pickle vegetables|atp
伝える|友だちに予定を|tell a friend my plans|at
続ける|練習を|continue practicing|atp
連れる|子どもを公園に|take a child to the park|at
届ける|友だちに荷物を|deliver a parcel to a friend|at
止める|車を|stop the car|at
取り替える|電池を|replace the battery|at
投げる|ボールを|throw the ball|at
慣れる|新しい仕事に|get used to the new job||||be used to the new job
逃げる|火事から|escape from a fire|a
似る|母に|come to resemble my mother||||resemble my mother
濡れる||get wet||服が|the clothes|be wet
乗り換える|次の駅で電車を|change trains at the next station|at
始める|練習を|start practicing|at
冷える||cool down||お茶が|the tea|be cold
増える||increase||人数が|the number of people
褒める|子どもを|praise a child|at
負ける|試合に|lose the match
間違える|答えを|get the answer wrong
見える||be visible||山が|the mountain
見つける|鍵を|find a key|at
迎える|駅で友だちを|meet a friend at the station|at
申し上げる|先生にお礼を|express my thanks to the teacher||私は|I
焼ける||be baked||パンが|the bread
痩せる||lose weight
揺れる||sway||木が|the tree|be swaying
汚れる||get dirty||服が|the clothes|be dirty
別れる|友だちと|part from a friend
割れる||break||コップが|the glass|be broken
付ける|電気を|turn on the light|at
片づける|部屋を|tidy the room|atp
遅れる|授業に|be late for class
認める|間違いを|admit a mistake|at
調べる|言葉の意味を|look up the meaning of a word|atp
伝える|友だちに予定を|tell a friend my plans|at
続ける|練習を|continue practicing|atp
`,
);

verbs(
  'suru',
  `
買い物する|スーパーで|shop at the supermarket|ap
結婚する|友だちと|get married to a friend||||be married to a friend
コピーする|資料を|copy a document|atp
散歩する|公園を|take a walk in the park|ap
する|宿題を|do my homework|atp
洗濯する|家で|do the laundry at home|ap
掃除する|部屋を|clean the room|atp
電話する|友だちに|call a friend|ap
勉強する|日本語を|study Japanese|atp
練習する|日本語を|practice Japanese|atp
安心する||feel relieved
案内する|町を|show someone around town|atp
運転する|車を|drive a car|atp
運動する|公園で|exercise in the park|ap
遠慮する|おかわりを|decline another helping|at
競走する|友だちと|race with a friend|ap
計画する|旅行を|plan a trip|atp
経験する|新しいことを|experience something new|at
けがする|足に|injure my foot
けんかする|友だちと|quarrel with a friend
研究する|日本語を|research Japanese|atp
故障する||break down||車が|the car|be broken down
支度する|旅行のために|prepare for a trip|ap
失敗する|実験に|fail at the experiment
出席する|会議に|attend a meeting|ap
出発する|駅から|depart from the station|a
準備する|夕食を|prepare dinner|atp
紹介する|先生に友だちを|introduce a friend to the teacher|at
招待する|友だちを|invite a friend|at
承知する|依頼を|accept the request|at
食事する|家で|have a meal at home|ap
心配する|家族を|worry about my family
生活する|東京で|live in Tokyo|ap
生産する|車を|produce cars|atp
説明する|問題を|explain the problem|atp
世話する|猫を|look after a cat|ap
相談する|先生に|consult the teacher|ap
卒業する|学校を|graduate from school|a
退院する||leave the hospital|a
チェックする|答えを|check the answer|atp
注意する|車に|watch out for cars|ap
入院する|病院に|be admitted to hospital||||be in hospital
入学する|大学に|enter university|a
拝見する|写真を|look at a photo||私は|I
びっくりする|その音に|be surprised by that sound
復習する|授業の内容を|review the lesson|atp
放送する|ニュースを|broadcast the news|atp
翻訳する|手紙を|translate a letter|atp
輸出する|車を|export cars|atp
ゆにゅうする|食べ物を|import food|atp
用意する|夕食を|prepare dinner|atp
予習する|次の課を|study the next lesson in advance|atp
予約する|ホテルを|book a hotel|at
連絡する|友だちに|contact a friend|ap
あいさつする|先生に|greet the teacher|ap
挨拶する|先生に|greet the teacher|ap
輸入する|食べ物を|import food|atp
確認する|予定を|check the schedule|atp
参加する|会議に|participate in a meeting|ap
利用する|図書館を|use the library|atp
変更する|予定を|change my plans|at
修理する|時計を|repair a clock|atp
整理する|書類を|organize the documents|atp
記録する|結果を|record the results|atp
保存する|写真を|save a photo|at
緊張する||feel nervous
`,
);
verbs('kuru', '来る|学校に|come to school|a');

// Columns: spelling(s), explicit Japanese subject, paired English subject,
// adjective sense, optional type exclusions. No random context nouns.
function adjectives(group, lines) {
  for (const line of lines.trim().split('\n')) {
    const [spellings, subjectJa, subjectEn, adjective, exclude = ''] = line.trim().split('|');
    for (const dict of spellings.split('／')) {
      profiles.set(`${group}:${dict}`, {
        kind: 'adjective',
        subjectJa,
        subjectEn,
        adjective,
        sense: adjective,
        exclude: exclude.split(',').filter(Boolean),
      });
    }
  }
}

adjectives(
  'i-adjective',
  `
青い|この空|this sky|blue
赤い|この花|this flower|red
明るい|この部屋|this room|bright
暖かい|この部屋|this room|warm
新しい|この本|this book|new
厚い|この本|this book|thick
暑い|今日|today|hot|adj-naru
熱い|このお茶|this tea|hot
危ない|この道|this road|dangerous
甘い|このお菓子|this sweet|sweet
いい|この本|this book|good
忙しい|私|I|busy
痛い|私の足|my foot|sore
薄い|この紙|this paper|thin
うるさい|この部屋|this room|noisy
おいしい／美味しい／うまい／美味い|この料理|this dish|delicious
多い|ここの人|the people here|numerous|adj-attributive,adj-sou,adj-naru
大きい|この箱|this box|big
遅い|この電車|this train|slow
重い|この箱|this box|heavy
おもしろい／面白い|この本|this book|interesting
軽い|この箱|this box|light
かわいい／可愛い|この猫|this cat|cute
黄色い|この花|this flower|yellow
汚い|この部屋|this room|dirty
暗い|この部屋|this room|dark
黒い|このかばん|this bag|black
寒い|今日|today|cold|adj-naru
白い|この紙|this paper|white
少ない|ここの人|the people here|few|adj-attributive,adj-sou,adj-naru
涼しい|この部屋|this room|cool
狭い|この部屋|this room|cramped
高い|この建物|this building|tall
楽しい|この授業|this class|fun
小さい|この箱|this box|small
近い|駅|the station|nearby|adj-sou,adj-naru
つまらない／詰まらない|この映画|this film|boring
冷たい|この水|this water|cold
強い|このチーム|this team|strong
遠い|駅|the station|far away|adj-sou,adj-naru
長い|このロープ|this rope|long
温い|このお茶|this tea|lukewarm
早い|出発|the departure|early
速い|この電車|this train|fast
低い|この机|this desk|low
広い|この部屋|this room|spacious
太い|このロープ|this rope|thick
古い|この本|this book|old
細い|この線|this line|thin
まずい／不味い|この料理|this dish|unappetizing
丸い|この机|this desk|round
短い|このロープ|this rope|short
難しい|この問題|this problem|difficult
易しい|この問題|this problem|easy
安い|この本|this book|inexpensive
弱い|このチーム|this team|weak
若い|この先生|this teacher|young|adj-naru
悪い|この結果|this result|bad
浅い|この川|this river|shallow
美しい|この景色|this scenery|beautiful
おかしい|この話|this story|strange
悲しい|私|I|sad
厳しい|この先生|this teacher|strict
細かい|この字|this writing|small
怖い|この映画|this film|scary
寂しい|私|I|lonely
すごい／凄い|この演奏|this performance|amazing
すばらしい／素晴らしい|この演奏|this performance|wonderful
正しい|この答え|this answer|correct
苦い|この薬|this medicine|bitter
眠い|私|I|sleepy
恥ずかしい|私|I|embarrassed
ひどい|この天気|this weather|terrible
深い|この川|this river|deep
珍しい|この花|this flower|rare|adj-naru
優しい|この先生|this teacher|kind
柔らかい|このパン|this bread|soft
よろしい|この方法|this method|acceptable
うれしい|私|I|happy
かっこいい|この服|this outfit|stylish
かたい／硬い／堅い|このパン|this bread|hard
やわらかい|このパン|this bread|soft
すっぱい／酸っぱい|この果物|this fruit|sour
楽しい|この授業|this class|fun
嬉しい|私|I|happy
寂しい／淋しい|私|I|lonely
恐ろしい|この話|this story|frightening
美味しい|この料理|this dish|delicious
詳しい|この説明|this explanation|detailed
正しい|この答え|this answer|correct
親しい|私たち|we|close
懐かしい|この写真|this photo|nostalgic
`,
);

adjectives(
  'na-adjective',
  `
嫌|この仕事|this task|unpleasant
いろいろ／色々|種類|the types|varied|adj-attributive,adj-sou,adj-sugiru,adj-naru
きれい／綺麗|この部屋|this room|clean
結構|この景色|this scenery|splendid|adj-sou,adj-sugiru,adj-naru
元気|この子|this child|energetic
静か|この部屋|this room|quiet
丈夫|このかばん|this bag|durable
大丈夫|この箱|this box|okay|adj-sugiru
大切|この本|this book|important
大変|この仕事|this task|difficult
にぎやか／賑やか|この町|this town|lively
暇|私|I|available
便利|この道具|this tool|convenient
本当|この話|this story|true|adj-sou,adj-sugiru,adj-naru
まっすぐ|この道|this road|straight
有名|この歌手|this singer|famous
りっぱ／立派|この建物|this building|splendid
安全|この道|this road|safe
美しい|この景色|this scenery|beautiful
オーバー|この表現|this expression|exaggerated
簡単|この問題|this problem|simple
危険|この道|this road|dangerous
急|この坂|this slope|steep
盛ん|この地域の商業|commerce in this area|active
残念|この結果|this result|disappointing
失礼|この言い方|this way of speaking|rude
邪魔|この箱|this box|in the way|adj-sou,adj-sugiru
自由|私|I|free
十分|この量|this amount|sufficient|adj-sou,adj-sugiru
親切|この先生|this teacher|kind
心配|私|I|worried
ソフト|このパン|this bread|soft
大事|この本|this book|important
確か|この情報|this information|certain|adj-sou,adj-naru
だめ|この方法|this method|no good|adj-sugiru,adj-naru
丁寧|この先生|this teacher|polite
適当|この量|this amount|appropriate
特別|この日|this day|special
熱心|この学生|this student|enthusiastic
必要|この道具|this tool|necessary|adj-sugiru,adj-naru
複雑|この問題|this problem|complicated
普通|この生活|this life|ordinary
不便|この場所|this place|inconvenient
変|この音|this sound|strange
まじめ／真面目|この学生|this student|serious
無理|この計画|this plan|unreasonable
別|この問題|this issue|separate|adj-attributive,adj-sou,adj-sugiru,adj-naru
いっぱい|この箱|this box|full|adj-attributive,adj-sugiru,adj-naru
重要|この問題|this issue|important
適切|この方法|this method|appropriate
正確|この情報|this information|accurate
明確|この説明|this explanation|clear
新鮮|この野菜|these vegetables|fresh|adj-naru
簡潔|この説明|this explanation|concise
快適|この部屋|this room|comfortable
不安|私|I|uneasy
満足|私|I|satisfied|adj-sou,adj-sugiru,adj-naru
不満|私|I|dissatisfied|adj-sou,adj-sugiru,adj-naru
公平|このルール|this rule|fair
平等|この扱い|this treatment|equal
豊か|この地域|this region|prosperous
貧乏|私|I|poor
健康|この子|this child|healthy
幸福|私|I|happy
幸せ|私|I|happy
退屈|この授業|this class|boring
可能|この方法|this method|possible|adj-sou,adj-sugiru,adj-naru
不可能|この計画|this plan|impossible|adj-sou,adj-sugiru,adj-naru
`,
);

// Predicates that do not translate as English "be + adjective" get their own
// reviewed constructions. Core forms are safe; generic modifier frames are not.
for (const [dict, sense, positive, negative, past, pastNegative] of [
  [
    '好き',
    'like this song',
    'I like this song.',
    'I do not like this song.',
    'I liked this song.',
    'I did not like this song.',
  ],
  [
    '大好き',
    'love this song',
    'I love this song.',
    'I do not love this song.',
    'I loved this song.',
    'I did not love this song.',
  ],
  [
    '嫌い',
    'dislike this song',
    'I dislike this song.',
    'I do not dislike this song.',
    'I disliked this song.',
    'I did not dislike this song.',
  ],
]) {
  profiles.set(`na-adjective:${dict}`, {
    kind: 'special-adjective',
    ja: '私はこの歌が',
    sense,
    forms: { positive, negative, past, pastNegative },
  });
}
for (const [dict, adjective] of [
  ['上手', 'good'],
  ['下手', 'bad'],
]) {
  profiles.set(`na-adjective:${dict}`, {
    kind: 'special-adjective',
    ja: '私は料理が',
    sense: `${adjective} at cooking`,
    forms: {
      positive: `I am ${adjective} at cooking.`,
      negative: `I am not ${adjective} at cooking.`,
      past: `I was ${adjective} at cooking.`,
      pastNegative: `I was not ${adjective} at cooking.`,
    },
  });
}

for (const [key, ja, sense, positive, negative, past, pastNegative] of [
  [
    'i-adjective:欲しい',
    '私は新しい本が',
    'want a new book',
    'I want a new book.',
    'I do not want a new book.',
    'I wanted a new book.',
    'I did not want a new book.',
  ],
  [
    'i-adjective:ない',
    '私には時間が',
    'not have time',
    'I do not have time.',
    'I am not without time.',
    'I did not have time.',
    'I was not without time.',
  ],
  [
    'na-adjective:楽しみ',
    '私は旅行が',
    'look forward to the trip',
    'I am looking forward to the trip.',
    'I am not looking forward to the trip.',
    'I was looking forward to the trip.',
    'I was not looking forward to the trip.',
  ],
  [
    'na-adjective:反対',
    '私はその計画に',
    'be opposed to the plan',
    'I am opposed to the plan.',
    'I am not opposed to the plan.',
    'I was opposed to the plan.',
    'I was not opposed to the plan.',
  ],
  [
    'na-adjective:久しぶり',
    '先生に会うのは',
    'meet the teacher after a long time',
    'It has been a long time since I met the teacher.',
    'It has not been a long time since I met the teacher.',
    'It had been a long time since I met the teacher.',
    'It had not been a long time since I met the teacher.',
  ],
]) {
  profiles.set(key, {
    kind: 'special-adjective',
    ja,
    sense,
    forms: { positive, negative, past, pastNegative },
  });
}

// 知らない means "do not know", while 知った expresses coming to know.
// Its aspect cannot be represented by blindly inflecting one English action.
profiles.get('godan:知る').coreEnglish = {
  positive: 'I learn that fact.',
  negative: 'I do not know that fact.',
  past: 'I found out that fact.',
  pastNegative: 'I did not know that fact.',
};

// Current imported readings contain kanji for four entries; approving their
// rendered furigana would be incorrect. しまう is listed as a bound auxiliary,
// so a standalone "put away" context would change the exercise's intended sense.
for (const key of [
  'godan:いただく',
  'i-adjective:うれしい',
  'na-adjective:いっぱい',
  'suru:あいさつする',
  'godan:しまう',
  'godan:楽む',
  'godan:終る',
  'godan:曲る',
  'godan:落す',
  'ichidan:落る',
])
  profiles.delete(key);

// These lexicon entries cannot use the supplied ordinary conjugation matrix:
// they are bound endings, adverbs, nouns, or an incomplete adjective spelling.
export const UNSUITABLE_SENTENCE_WORDS = Object.freeze(
  Object.fromEntries([
    ['godan:がる', 'Bound ending requires a preceding adjective and its own argument structure.'],
    ['godan:だす', 'The listed starting-to-do sense is a bound auxiliary, not a standalone verb.'],
    ['godan:かく', 'The listed humiliation sense requires an expression such as 恥をかく.'],
    [
      'godan:楽む',
      'Imported spelling omits standard okurigana; generated 楽んだ needs normalization to 楽しんだ.',
    ],
    [
      'godan:終る',
      'Imported spelling abbreviates okurigana; review against the standard 終わる surface before publication.',
    ],
    [
      'godan:曲る',
      'Imported spelling abbreviates okurigana; review against the standard 曲がる surface before publication.',
    ],
    [
      'godan:落す',
      'Imported spelling abbreviates okurigana; review against the standard 落とす surface before publication.',
    ],
    [
      'ichidan:落る',
      'Imported spelling abbreviates okurigana; review against the standard 落ちる surface before publication.',
    ],
    [
      'godan:しまう',
      'The listed end-up-doing sense is a bound auxiliary and needs a preceding verb.',
    ],
    ['godan:いただく', 'The current supposed kana reading contains kanji: 頂く.'],
    ['i-adjective:うれしい', 'The current supposed kana reading contains kanji: 嬉しい.'],
    ['na-adjective:いっぱい', 'The current supposed kana reading contains kanji: 一杯.'],
    ['suru:あいさつする', 'The current supposed kana reading contains kanji: 挨拶する.'],
    [
      'i-adjective:辛い',
      'The stored reading づらい is a bound ending and does not match a standalone 辛い predicate.',
    ],
    ['na-adjective:余り', 'The listed adverbial sense is not a regular na-adjective.'],
    ['na-adjective:いかが', 'Interrogative expression is not a regular na-adjective.'],
    ['na-adjective:大人', 'Noun requires 大人の, not the generated 大人な attributive.'],
    ['na-adjective:同じ', 'Attributive is 同じ, not the generated 同じな.'],
    ['na-adjective:黄色', 'Color noun requires 黄色の, not the generated 黄色な.'],
    ['i-adjective:くらい', 'The listed approximate-quantity sense is a bound expression.'],
    ['na-adjective:そう', 'The listed response expression is not a regular na-adjective.'],
    ['na-adjective:たくさん', 'Quantity expression is not a regular na-adjective.'],
    ['na-adjective:沢山', 'Quantity expression is not a regular na-adjective.'],
    ['na-adjective:多分', 'Probability adverb is not a regular na-adjective.'],
    ['na-adjective:まだ', 'Time adverb is not a regular na-adjective.'],
    ['na-adjective:味', 'The listed taste noun is not a regular na-adjective.'],
    [
      'na-adjective:安心',
      'The ordinary predicate requires 安心する; this matrix generates other constructions.',
    ],
    [
      'na-adjective:一生懸命',
      'The adverbial effort expression needs a compatible action, not arbitrary predicate frames.',
    ],
    ['i-adjective:堅', 'Incomplete i-adjective spelling lacks the terminal い.'],
    ['na-adjective:ずいぶん', 'Degree adverb is not a regular na-adjective.'],
    ['na-adjective:随分', 'Degree adverb is not a regular na-adjective.'],
    ['na-adjective:たいてい', 'Frequency adverb is not a regular na-adjective.'],
    ['na-adjective:大抵', 'Frequency adverb is not a regular na-adjective.'],
    ['na-adjective:中々', 'Degree adverb is not a regular na-adjective.'],
    ['i-adjective:にくい', 'Bound difficulty ending requires a preceding verb stem.'],
    ['i-adjective:やすい', 'The listed easy-to-do ending requires a preceding verb stem.'],
    ['na-adjective:寝坊', 'The listed sleeping-late noun needs a suru construction.'],
    ['na-adjective:かっこう', 'Appearance noun is not a regular na-adjective.'],
  ]),
);

export const REVIEWED_SENTENCE_PROFILES = Object.freeze(Object.fromEntries(profiles));

export function reviewedSentenceProfile(word) {
  if (!word || !word.group || !word.dict) return null;
  const key = `${word.group}:${word.dict}`;
  const identity = REVIEWED_SENTENCE_LEXEMES[key];
  if (
    !identity ||
    word.reading !== identity[0] ||
    word.meaning !== identity[1] ||
    String(word.exerciseMeaning || '') !== String(identity[2] || '')
  )
    return null;
  return REVIEWED_SENTENCE_PROFILES[key] || null;
}

export function sentenceWordReview(word) {
  const key = `${word?.group || ''}:${word?.dict || ''}`;
  const profile = reviewedSentenceProfile(word);
  if (profile) return { status: 'supported', key, sense: profile.sense, profile };
  const reason = UNSUITABLE_SENTENCE_WORDS[key];
  return reason
    ? { status: 'unsuitable', key, reason }
    : {
        status: 'needs-review',
        key,
        reason: 'No explicit bilingual lexical profile has been reviewed.',
      };
}

// Exact source identities reviewed with the explicit contexts above. A custom
// homograph, changed reading, or changed displayed sense does not inherit an approval.
export const REVIEWED_SENTENCE_LEXEMES = Object.freeze({
  'godan:いらっしゃる': ['いらっしゃる', '-- honorific expression for いく, くる, and いる --', ''],
  'godan:うかがう': ['うかがう', 'to ask', ''],
  'godan:おっしゃる': ['おっしゃる', '-- honorific expression for いう --', ''],
  'godan:おる': ['おる', '-- extra-modest expression for いる --', ''],
  'godan:おわる': ['おわる', 'to finish doing ~', ''],
  'godan:かかる': ['かかる', 'it takes (amount of time, money) (v.i.)', ''],
  'godan:かぶる': ['かぶる', 'to wear, to put on (e.g., a hat on the head)', ''],
  'godan:かまう': ['かまう', 'to mind, to care about, to be concerned about', ''],
  'godan:くださる': ['くださる', '(hon.) to give, to confer', ''],
  'godan:ごらんになる': ['ごらんになる', '-- honorific expression for みる --', ''],
  'godan:さす': ['さす', 'to open; hold (an umbrella)', ''],
  'godan:すく': ['すく', '[a road] Get empty', ''],
  'godan:なさる': ['なさる', '-- honorific expression for する --', ''],
  'godan:なる': ['なる', 'to become', ''],
  'godan:はく': ['はく', 'to put on (items below your waist)', ''],
  'godan:もらう': ['もらう', 'to receive', ''],
  'godan:やる': ['やる', 'to do; to give (to pets, parents, siblings, etc.)', ''],
  'godan:上がる': ['あがる', 'to rise, to go up', ''],
  'godan:下る': ['くだる', 'to get down, to descend', ''],
  'godan:並ぶ': ['ならぶ', 'to line up, to stand in a line (v.i.)', ''],
  'godan:乗る': ['のる', 'to get on, to ride in, to board', ''],
  'godan:乾く': ['かわく', 'to get dry', ''],
  'godan:亡くなる': ['なくなる', 'to pass away', ''],
  'godan:休む': ['やすむ', 'to rest, to have a break, to get time off', ''],
  'godan:会う': ['あう', 'to meet, to see', ''],
  'godan:伺う': ['うかがう', 'humble form of 行く (いく), 聞く (きく) and 来る (くる)', ''],
  'godan:住む': ['すむ', 'to reside, to live in', ''],
  'godan:作る': ['つくる', 'to make, to create', 'to make'],
  'godan:使う': ['つかう', 'to use', ''],
  'godan:働く': ['はたらく', 'to work', ''],
  'godan:光る': ['ひかる', 'to shine, to glitter', ''],
  'godan:入る': ['はいる', 'to enter, to contain, to hold', ''],
  'godan:写す': ['うつす', 'to copy (v.t.); to photograph', ''],
  'godan:出す': ['だす', 'to take (something) out; to hand in (something)', ''],
  'godan:分かる': ['わかる', 'to understand', ''],
  'godan:切る': ['きる', 'to cut; to hang up (a phone)', ''],
  'godan:動かす': ['うごかす', 'to move, to shift', ''],
  'godan:動く': ['うごく', 'to move', ''],
  'godan:勝つ': ['かつ', 'to win', ''],
  'godan:包む': ['つつむ', 'to wrap, to cover', ''],
  'godan:参る': ['まいる', 'humble expression for 行く and 来る', ''],
  'godan:取る': ['とる', 'to take (a class); to get (a grade)', 'to take'],
  'godan:叩く': ['はたく', 'to strike, to clap, to dust, to beat', ''],
  'godan:召し上がる': ['めしあがる', '-- honorific form of 食べる (たべる) and 飲む (のむ) --', ''],
  'godan:叱る': ['しかる', 'to scold', ''],
  'godan:合う': ['あう', 'to fit, to match', ''],
  'godan:向かう': ['むかう', 'to face, to go towards', ''],
  'godan:吸う': ['すう', 'to breathe in, to suck', ''],
  'godan:吹く': ['ふく', 'to blow (wind, etc.)', ''],
  'godan:呼ぶ': ['よぶ', "to call (one's name); to invite", ''],
  'godan:咲く': ['さく', 'to bloom', ''],
  'godan:喜ぶ': ['よろこぶ', 'to rejoice, to be delighted, to be glad', ''],
  'godan:噛む': ['かむ', 'to bite, to chew', ''],
  'godan:回す': ['まわす', 'to turn', ''],
  'godan:回る': ['まわる', 'to go around, to revolve', ''],
  'godan:困る': ['こまる', 'to be bothered, to have difficulty', ''],
  'godan:在る': ['ある', 'to live, to be, to exist', ''],
  'godan:塗る': ['ぬる', 'to paint, to plaster', ''],
  'godan:増す': ['ます', 'to increase, to gain', ''],
  'godan:壊す': ['こわす', 'to break, to break down', ''],
  'godan:売る': ['うる', 'to sell (v.t.)', ''],
  'godan:変わる': ['かわる', 'to change (v.i.), to be transformed, to vary', ''],
  'godan:太る': ['ふとる', 'to gain weight', ''],
  'godan:始まる': ['はじまる', '(something) begins', ''],
  'godan:守る': ['まもる', 'to protect; to abide (by the rules)', ''],
  'godan:寄る': ['よる', 'to stop by', ''],
  'godan:差す': ['さす', 'to raise (stretch out) hands, to raise (e.g., umbrella)', ''],
  'godan:帰る': ['かえる', 'to go back, to go home, to return', 'to return home'],
  'godan:座る': ['すわる', 'to sit', ''],
  'godan:引く': ['ひく', 'to pull, to draw; subtract', ''],
  'godan:引っ越す': ['ひっこす', 'to move to a new place of residence', ''],
  'godan:弾く': ['はじく', 'to play (piano, guitar)', ''],
  'godan:役に立つ': ['やくにたつ', 'to be helpful, to be useful', ''],
  'godan:待つ': ['まつ', 'to wait', ''],
  'godan:怒る': ['おこる', 'to get angry; to scold angrily', ''],
  'godan:思い出す': ['おもいだす', 'to recall, to remember', ''],
  'godan:思う': ['おもう', 'to think, to feel', ''],
  'godan:急ぐ': ['いそぐ', 'to hurry, to be in a hurry, to rush', ''],
  'godan:戻る': ['もどる', 'to return (v.i.); to come back', ''],
  'godan:手伝う': ['てつだう', 'to help', ''],
  'godan:打つ': ['ぶつ', 'to hit, to strike', ''],
  'godan:払う': ['はらう', 'to pay', ''],
  'godan:折る': ['おる', 'to snap, to break; to bend', ''],
  'godan:押す': ['おす', 'to push, to press, to stamp (e.g., a passport)', ''],
  'godan:拾う': ['ひろう', 'to pick up (something), to find', ''],
  'godan:持つ': ['もつ', 'to hold, to carry; to possess', 'to hold'],
  'godan:探す': ['さがす', 'to search, to seek, to look for', ''],
  'godan:撮る': ['とる', 'to take (a photo), to make (a film)', ''],
  'godan:断る': ['ことわる', 'to refuse, to decline, to dismiss', ''],
  'godan:曇る': ['くもる', 'to become cloudy, to become dim', ''],
  'godan:書く': ['かく', 'to write', ''],
  'godan:有る': ['ある', 'to be, to have', ''],
  'godan:歌う': ['うたう', 'to sing', ''],
  'godan:止まる': ['とまる', 'to come to a halt', ''],
  'godan:止む': ['やむ', 'to cease, to stop', ''],
  'godan:歩く': ['あるく', 'to walk', ''],
  'godan:死ぬ': ['しぬ', 'to die', ''],
  'godan:残る': ['のこる', 'to remain (v.i.), to be left', ''],
  'godan:決まる': ['きまる', 'to be set; fixed (v.i.)', ''],
  'godan:沸かす': ['わかす', 'to boil', ''],
  'godan:沸く': ['わく', 'to boil, to grow hot', ''],
  'godan:治る': ['なおる', 'to get better; to recover from illness (v.i.)', ''],
  'godan:泊まる': ['とまる', 'to stay (over night) (v.i.)', ''],
  'godan:泣く': ['なく', 'to cry', ''],
  'godan:泳ぐ': ['およぐ', 'to swim', ''],
  'godan:洗う': ['あらう', 'to wash', ''],
  'godan:消す': ['けす', 'to erase, to delete, to turn off power', ''],
  'godan:済む': ['すむ', 'to finish, to end', ''],
  'godan:減る': ['へる', 'to decrease (in size or number), to diminish', ''],
  'godan:渡す': ['わたす', 'to hand (something) over (v.t.); to get across', ''],
  'godan:渡る': ['わたる', 'to cross over, to go across', ''],
  'godan:滑る': ['すべる', 'to slide, to slip', ''],
  'godan:点く': ['つく', 'to be started, to be switched on', ''],
  'godan:無くす': ['なくす', 'to lose something', ''],
  'godan:無くなる': ['なくなる', 'to disappear, to get lost', ''],
  'godan:焼く': ['やく', 'to bake, to grill', ''],
  'godan:申す': ['もうす', '-- extra-modest (humble) expression for 言う (いう) --', ''],
  'godan:登る': ['のぼる', 'to climb', ''],
  'godan:盗む': ['ぬすむ', 'to steal; to rob', ''],
  'godan:直す': ['なおす', 'to correct (v.t.); to fix', ''],
  'godan:直る': ['なおる', 'to be fixed', ''],
  'godan:眠る': ['ねむる', 'to sleep', ''],
  'godan:着く': ['つく', 'to arrive at, to reach', ''],
  'godan:知る': ['しる', 'to know, to understand', ''],
  'godan:磨く': ['みがく', 'to brush (teeth); to polish', ''],
  'godan:祈る': ['いのる', 'to pray; to wish', ''],
  'godan:移る': ['うつる', 'to move (from a house); to transfer (from a department); to shift', ''],
  'godan:空く': ['あく', 'to open, to become empty (vacant)', ''],
  'godan:立つ': ['たつ', 'to stand up', 'to stand'],
  'godan:笑う': ['わらう', 'to laugh, to smile', ''],
  'godan:続く': ['つづく', 'follow, continue, go on', ''],
  'godan:置く': ['おく', 'to put; to lay; to place', ''],
  'godan:習う': ['ならう', 'to learn', ''],
  'godan:聞く': ['きく', 'to hear, to listen, to ask', 'to listen / ask'],
  'godan:脱ぐ': ['ぬぐ', 'to take off (clothes)', ''],
  'godan:致す': ['いたす', '-- extra-modest expression for する --', ''],
  'godan:行う': ['おこなう', 'to carry out; to conduct (typically used in written language)', ''],
  'godan:行く': ['いく', 'to go', ''],
  'godan:被る': ['かぶる', 'to wear; to be covered with', ''],
  'godan:要る': ['いる', 'to need', ''],
  'godan:見つかる': ['みつかる', 'to be found (v.i.), to be discovered', ''],
  'godan:触る': ['さわる', 'to touch, to feel', ''],
  'godan:言う': ['いう', 'to say', ''],
  'godan:話す': ['はなす', 'to speak', ''],
  'godan:誘う': ['さそう', 'to invite (someone to do something with you); to tempt, to lure', ''],
  'godan:読む': ['よむ', 'to read', ''],
  'godan:謝る': ['あやまる', 'to apologize', ''],
  'godan:買う': ['かう', 'to buy', ''],
  'godan:貸す': ['かす', 'to lend', ''],
  'godan:貼る': ['はる', 'to post; to paste; to attach', ''],
  'godan:走る': ['はしる', 'to run', ''],
  'godan:起こす': ['おこす', 'to wake (someone) up', ''],
  'godan:足す': ['たす', 'to add (numbers)', ''],
  'godan:跳ぶ': ['とぶ', 'Jump', ''],
  'godan:踊る': ['おどる', 'to dance', ''],
  'godan:踏む': ['ふむ', 'to step on, to tread on', ''],
  'godan:込む': ['こむ', 'to be crowded', ''],
  'godan:返す': ['かえす', 'to return something', ''],
  'godan:送る': ['おくる', 'to send, to dispatch', ''],
  'godan:通う': ['かよう', 'to go back and forth; to commute', ''],
  'godan:通る': ['とおる', 'to pass (by), to go through', ''],
  'godan:進む': ['すすむ', 'to advance, to proceed', ''],
  'godan:遊ぶ': ['あそぶ', 'to play; to spend time pleasantly; to hang out', 'to play'],
  'godan:運ぶ': ['はこぶ', 'to transport, to carry', ''],
  'godan:違う': ['ちがう', 'to be different; to differ; wrong', ''],
  'godan:選ぶ': ['えらぶ', 'to choose; to select', ''],
  'godan:釣る': ['つる', 'to fish', ''],
  'godan:閉まる': ['しまる', 'to close, to be closed', ''],
  'godan:開く': ['ひらく', 'to open; to hold (an event)', ''],
  'godan:間に合う': ['まにあう', 'to be in time for', ''],
  'godan:降る': ['ふる', 'to precipitate, to fall (e.g., rain, snow, etc.)', ''],
  'godan:集まる': ['あつまる', 'to gather (v.i.), to collect', ''],
  'godan:頑張る': ['がんばる', "to try one's best, to try hard, to persist", ''],
  'godan:頼む': ['たのむ', 'to request, to ask (a favor)', ''],
  'godan:飛ぶ': ['とぶ', 'to fly, to hop', ''],
  'godan:飲む': ['のむ', 'to drink', ''],
  'godan:飾る': ['かざる', 'to decorate, to adorn', ''],
  'godan:騒ぐ': ['さわぐ', 'to make noise, to clamor', ''],
  'godan:驚く': ['おどろく', 'to be surprised, to be astonished', ''],
  'godan:鳴く': ['なく', 'to make sound (animal)', ''],
  'godan:鳴る': ['なる', 'to sound, to ring (v.i.)', ''],
  'i-adjective:いい': ['いい', 'good', ''],
  'i-adjective:うまい': ['うまい', 'delicious; skillful; fortunate', ''],
  'i-adjective:うるさい': ['うるさい', 'noisy; annoying', ''],
  'i-adjective:おいしい': ['おいしい', 'Delicious, tasty', 'delicious'],
  'i-adjective:おかしい': ['おかしい', 'strange; odd; funny', ''],
  'i-adjective:おもしろい': ['おもしろい', 'Interesting', ''],
  'i-adjective:かっこいい': ['かっこいい', 'cool / good-looking', ''],
  'i-adjective:かわいい': ['かわいい', 'Lovely, Cute', ''],
  'i-adjective:すごい': ['すごい', 'Great, Awful', ''],
  'i-adjective:すっぱい': ['すっぱい', 'sour, acid', ''],
  'i-adjective:すばらしい': ['すばらしい', 'Marvelous, wonderful', ''],
  'i-adjective:つまらない': ['つまらない', 'boring, dull; insignificant', ''],
  'i-adjective:ない': ['ない', "there isn't, doesn't have", ''],
  'i-adjective:ひどい': ['ひどい', 'terrible, awful, unfair, cruel', ''],
  'i-adjective:まずい': [
    'まずい',
    'terrible (in reference to food), unappetizing, unpleasant (taste)',
    '',
  ],
  'i-adjective:よろしい': ['よろしい', '(hon.) good, OK, all right', ''],
  'i-adjective:不味い': ['まずい', 'Unpleasent, Unappetising', ''],
  'i-adjective:丸い': ['まるい', 'round, circular', ''],
  'i-adjective:低い': ['ひくい', 'short, low', ''],
  'i-adjective:優しい': ['やさしい', 'kind (person), gentle (person), easy (problem)', ''],
  'i-adjective:冷たい': ['つめたい', 'cold (things, people)', ''],
  'i-adjective:凄い': ['すごい', 'terrific, great', ''],
  'i-adjective:危ない': ['あぶない', 'dangerous, critical', ''],
  'i-adjective:厚い': ['あつい', 'kind, warm(hearted), thick, deep', ''],
  'i-adjective:厳しい': ['きびしい', 'hard; rigorous; strict', ''],
  'i-adjective:古い': ['ふるい', 'old (in reference to objects, not people), aged, ancient', 'old'],
  'i-adjective:可愛い': ['かわいい', 'cute, adorable', ''],
  'i-adjective:堅い': ['かたい', 'hard, firm, solid', ''],
  'i-adjective:多い': ['おおい', 'many; there are a lot', ''],
  'i-adjective:大きい': ['おおきい', 'big, large', 'big'],
  'i-adjective:太い': ['ふとい', 'fat, thick', ''],
  'i-adjective:安い': ['やすい', 'inexpensive; cheap (things)', 'cheap'],
  'i-adjective:寂しい': ['さびしい', 'lonely, lonesome', ''],
  'i-adjective:寒い': ['さむい', 'cold (in reference to weather)', 'cold weather'],
  'i-adjective:小さい': ['ちいさい', 'small, little', 'small'],
  'i-adjective:少ない': ['すくない', 'a little; a few', ''],
  'i-adjective:広い': ['ひろい', 'spacious; wide; broad', ''],
  'i-adjective:弱い': ['よわい', 'weak', ''],
  'i-adjective:強い': ['つよい', 'strong, powerful', ''],
  'i-adjective:忙しい': ['いそがしい', 'busy (people, days)', 'busy'],
  'i-adjective:怖い': ['こわい', 'scary, frightening', ''],
  'i-adjective:恐ろしい': ['おそろしい', 'terrible, dreadful', ''],
  'i-adjective:恥ずかしい': ['はずかしい', 'ashamed, embarrassed', ''],
  'i-adjective:悪い': ['わるい', 'bad, sinful; inferior', ''],
  'i-adjective:悲しい': ['かなしい', 'sad, sorrowful', ''],
  'i-adjective:懐かしい': ['なつかしい', 'dear, desired, missed', ''],
  'i-adjective:新しい': ['あたらしい', 'new', ''],
  'i-adjective:早い': ['はやい', 'early', ''],
  'i-adjective:明るい': [
    'あかるい',
    'bright (in reference to personality or weather); cheerful',
    '',
  ],
  'i-adjective:易しい': ['やさしい', 'easy, plain, simple', 'easy / kind'],
  'i-adjective:暑い': ['あつい', 'hot (in reference to weather), warm', 'hot weather'],
  'i-adjective:暖かい': ['あたたかい', 'warm', ''],
  'i-adjective:暗い': ['くらい', 'dark, gloomy', ''],
  'i-adjective:柔らかい': ['やわらかい', 'soft (in reference to texture), tender', ''],
  'i-adjective:楽しい': ['たのしい', 'enjoyable, fun', 'fun'],
  'i-adjective:欲しい': ['ほしい', 'to want, in need of', ''],
  'i-adjective:正しい': ['ただしい', 'correct', ''],
  'i-adjective:汚い': ['きたない', 'dirty, unclean, filthy', ''],
  'i-adjective:浅い': ['あさい', 'shallow, superficial', ''],
  'i-adjective:涼しい': ['すずしい', 'cool, refreshing (in reference to weather)', ''],
  'i-adjective:深い': ['ふかい', 'deep, profound', ''],
  'i-adjective:温い': ['ぬるい', 'lukewarm', ''],
  'i-adjective:熱い': ['あつい', 'hot (objects)', ''],
  'i-adjective:狭い': ['せまい', 'narrow; not spacious', ''],
  'i-adjective:珍しい': ['めずらしい', 'unusual, rare', ''],
  'i-adjective:甘い': ['あまい', 'generous, sweet', ''],
  'i-adjective:痛い': ['いたい', 'hurt; painful; sore', ''],
  'i-adjective:白い': ['しろい', 'white', ''],
  'i-adjective:眠い': ['ねむい', 'sleepy, drowsy', ''],
  'i-adjective:短い': ['みじかい', 'short (length)', ''],
  'i-adjective:硬い': ['かたい', 'hard, firm, solid', ''],
  'i-adjective:素晴らしい': ['すばらしい', 'wonderful; terrific', ''],
  'i-adjective:細い': ['ほそい', 'thin, slender, fine', ''],
  'i-adjective:細かい': ['こまかい', 'small; fine, minute', ''],
  'i-adjective:美しい': ['うつくしい', 'beautiful, lovely', ''],
  'i-adjective:美味い': ['うまい', 'Tasty, delicious', ''],
  'i-adjective:美味しい': ['おいしい', 'delicious, tasty', ''],
  'i-adjective:若い': ['わかい', 'young', ''],
  'i-adjective:苦い': ['にがい', 'bitter', ''],
  'i-adjective:薄い': ['うすい', 'thin, weak', ''],
  'i-adjective:親しい': ['したしい', 'intimate, close (e.g., friend)', ''],
  'i-adjective:詰まらない': ['つまらない', 'Boring, Dull', ''],
  'i-adjective:詳しい': ['くわしい', 'detailed; full; accurate', ''],
  'i-adjective:赤い': ['あかい', 'red', ''],
  'i-adjective:軽い': ['かるい', 'light, non-serious, minor', ''],
  'i-adjective:近い': ['ちかい', 'near, close by, short', ''],
  'i-adjective:速い': ['はやい', 'fast, quick', ''],
  'i-adjective:遅い': ['おそい', 'slow; (to be) late', ''],
  'i-adjective:遠い': ['とおい', 'far (away), distant', ''],
  'i-adjective:酸っぱい': ['すっぱい', 'Sour (taste)', ''],
  'i-adjective:重い': ['おもい', 'heavy; serious', ''],
  'i-adjective:長い': ['ながい', 'long, lengthy', ''],
  'i-adjective:難しい': ['むずかしい', 'difficult', ''],
  'i-adjective:青い': ['あおい', 'blue', ''],
  'i-adjective:面白い': ['おもしろい', 'interesting, amusing', ''],
  'i-adjective:高い': ['たかい', 'tall, high; expensive', 'tall / expensive'],
  'i-adjective:黄色い': ['きいろい', 'yellow', ''],
  'i-adjective:黒い': ['くろい', 'black; dark', ''],
  'ichidan:あげる': ['あげる', 'to give', ''],
  'ichidan:いじめる': ['いじめる', 'to bully, to torment', ''],
  'ichidan:かける': ['かける', 'to dial/call (e.g., phone); to sit down', ''],
  'ichidan:くれる': ['くれる', 'to give, to do for', ''],
  'ichidan:つける': ['つける', 'to turn on (e.g., a light); to take', ''],
  'ichidan:できる': ['できる', 'to be able to (to accomplish)', ''],
  'ichidan:上げる': ['あげる', 'to raise, to lift', ''],
  'ichidan:下げる': ['さげる', 'to lower (v.t.); to hang', ''],
  'ichidan:下りる': ['おりる', 'to get down, to go; come down', ''],
  'ichidan:並べる': ['ならべる', 'to put (things) side by side; to line up', ''],
  'ichidan:乗り換える': ['のりかえる', 'to transfer (trains), to change (bus, train, etc.)', ''],
  'ichidan:付ける': ['つける', 'to attach, to join, to add', ''],
  'ichidan:伝える': ['つたえる', 'to convey (a message); to tell, to report', ''],
  'ichidan:似る': ['にる', 'to resemble, to be similar', ''],
  'ichidan:倒れる': ['たおれる', 'to collapse, to break down', ''],
  'ichidan:借りる': ['かりる', 'to borrow, to owe', ''],
  'ichidan:入れる': ['いれる', 'to put in', ''],
  'ichidan:冷える': ['ひえる', 'to grow cold, to cool down', ''],
  'ichidan:出かける': ['でかける', 'to go out; to depart', ''],
  'ichidan:出る': ['でる', 'to appear, to leave', 'to leave / exit'],
  'ichidan:別れる': ['わかれる', 'to part from, to separate', ''],
  'ichidan:割れる': ['われる', 'to break', ''],
  'ichidan:勤める': ['つとめる', 'to work (for)', ''],
  'ichidan:取り替える': ['とりかえる', 'to exchange, to replace', ''],
  'ichidan:受ける': ['うける', 'to take (an examination, interview, etc.); to receive', ''],
  'ichidan:増える': ['ふえる', 'to increase, to multiply', ''],
  'ichidan:壊れる': ['こわれる', 'to be broken, to break', ''],
  'ichidan:変える': ['かえる', 'to change, to alter, to vary', ''],
  'ichidan:始める': ['はじめる', 'to start, to begin', ''],
  'ichidan:寝る': ['ねる', 'to sleep; to go to sleep; to go to bed', 'to sleep'],
  'ichidan:尋ねる': ['たずねる', 'to inquire (same as 質問する)', ''],
  'ichidan:居る': ['いる', '(humble) to be (animate), to exist', ''],
  'ichidan:届ける': ['とどける', 'to deliver (v.t.)', ''],
  'ichidan:差し上げる': ['さしあげる', '-- humble expression for あげる --', ''],
  'ichidan:建てる': ['たてる', 'to build', ''],
  'ichidan:忘れる': ['わすれる', 'to forget', ''],
  'ichidan:慣れる': ['なれる', 'to grow accustomed to', ''],
  'ichidan:投げる': ['なげる', 'to pitch, to cast away', ''],
  'ichidan:折れる': ['おれる', 'to break, to be folded, to give in; to turn (a corner)', ''],
  'ichidan:捕まえる': ['つかまえる', 'to catch, to arrest', ''],
  'ichidan:捨てる': ['すてる', 'throw away (trash), dump, discard', ''],
  'ichidan:掛ける': ['かける', 'to put on (e.g., glasses); to hang (e.g., on a wall)', ''],
  'ichidan:揺れる': ['ゆれる', 'to shake, to sway', ''],
  'ichidan:教える': ['おしえる', 'to teach, to inform, to instruct', 'to teach'],
  'ichidan:晴れる': ['はれる', 'to be sunny', ''],
  'ichidan:暮れる': ['くれる', 'to get dark, to come to an end', ''],
  'ichidan:植える': ['うえる', 'to plant', ''],
  'ichidan:止める': ['とどめる', 'to end, to stop, to cease, to resign', ''],
  'ichidan:比べる': ['くらべる', 'to compare', ''],
  'ichidan:汚れる': ['よごれる', 'to become dirty', ''],
  'ichidan:決める': ['きめる', 'to decide (v.t.)', ''],
  'ichidan:浴びる': ['あびる', 'to bathe, to shower', ''],
  'ichidan:消える': ['きえる', 'to vanish, to disappear', ''],
  'ichidan:漬ける': ['つける', 'to soak, to moisten, to pickle', ''],
  'ichidan:濡れる': ['ぬれる', 'to get wet', ''],
  'ichidan:焼ける': ['やける', 'to burn, to be roasted', ''],
  'ichidan:片付ける': ['かたづける', 'to (clean) tidy up (v.t.), to put away', ''],
  'ichidan:生きる': ['いきる', 'to live', ''],
  'ichidan:生まれる': ['うまれる', 'to be born', ''],
  'ichidan:申し上げる': ['もうしあげる', '(humble)to say, to tell', ''],
  'ichidan:疲れる': ['つかれる', 'to get (become) tired; to become fatigued', ''],
  'ichidan:痩せる': ['やせる', 'to lose weight', ''],
  'ichidan:着る': ['きる', 'to put on (clothes above your waist); to wear', 'to wear'],
  'ichidan:知らせる': ['しらせる', 'to notify', ''],
  'ichidan:立てる': ['たてる', 'to stand (something) up, to erect (something)', ''],
  'ichidan:答える': ['こたえる', 'to answer, to reply', ''],
  'ichidan:続ける': ['つづける', 'to continue doing ~', ''],
  'ichidan:締める': ['しめる', 'to tie, to fasten, to tighten', ''],
  'ichidan:考える': ['かんがえる', 'to think (about); to consider', ''],
  'ichidan:聞こえる': ['きこえる', 'to be heard, to be audible', ''],
  'ichidan:育てる': ['そだてる', 'to raise (v.t.); to bring up', ''],
  'ichidan:褒める': ['ほめる', 'to praise; to say nice things', ''],
  'ichidan:見える': ['みえる', 'to be visible; -- polite verb meaning 来る (くる) --', ''],
  'ichidan:見せる': ['みせる', 'to show, to display', ''],
  'ichidan:見つける': ['みつける', 'to discover, to find (v.t.)', ''],
  'ichidan:見る': ['みる', 'to see, to look', 'to see / watch'],
  'ichidan:覚える': [
    'おぼえる',
    'to learn, to commit to memory, to remember, to memorize',
    'to remember',
  ],
  'ichidan:訪ねる': ['たずねる', 'to visit', ''],
  'ichidan:認める': ['みとめる', 'to recognize, to notice; to approve', ''],
  'ichidan:調べる': ['しらべる', 'to check; to look up; to inquire; to search', ''],
  'ichidan:負ける': ['まける', 'to lose (a game) (v.i.), to be defeated', ''],
  'ichidan:起きる': ['おきる', 'to get up (e.g., from sleeping); to happen', 'to wake up'],
  'ichidan:足りる': ['たりる', 'to be sufficient; to be enough', ''],
  'ichidan:迎える': ['むかえる', 'to welcome; to meet; to greet', ''],
  'ichidan:逃げる': ['にげる', 'to escape, to run away', ''],
  'ichidan:連れる': ['つれる', 'to lead, to take (a person)', ''],
  'ichidan:遅れる': ['おくれる', 'to (be) become late', ''],
  'ichidan:過ぎる': ['すぎる', 'too much ~', ''],
  'ichidan:閉める': ['しめる', 'to close, to shut', 'to close'],
  'ichidan:開ける': ['あける', 'to open (v.t.)', 'to open'],
  'ichidan:間違える': ['まちがえる', 'to make a mistake', ''],
  'ichidan:降りる': ['おりる', 'to get off', ''],
  'ichidan:集める': ['あつめる', 'to collect, to gather (v.t.), to assemble', ''],
  'ichidan:食べる': ['たべる', 'to eat', ''],
  'kuru:来る': ['くる', 'to come', ''],
  'na-adjective:いろいろ': ['いろいろ', 'Various', ''],
  'na-adjective:きれい': ['きれい', 'Beautiful, Clean', 'pretty / clean'],
  'na-adjective:だめ': ['だめ', 'useless, no good, hopeless', ''],
  'na-adjective:にぎやか': ['にぎやか', 'bustling, busy', ''],
  'na-adjective:まじめ': ['まじめ', 'Serious', ''],
  'na-adjective:まっすぐ': ['まっすぐ', 'straight (ahead), direct', ''],
  'na-adjective:りっぱ': ['りっぱ', 'splendid, fine', ''],
  'na-adjective:オーバー': ['オーバー', 'overcoat; over, exceeding, exaggeration', ''],
  'na-adjective:ソフト': ['ソフト', 'soft; soft hat; software', ''],
  'na-adjective:丁寧': ['ていねい', 'polite, courteous, careful', ''],
  'na-adjective:丈夫': ['じょうぶ', 'strong, solid, durable', ''],
  'na-adjective:上手': ['じょうず', 'be good at, skillful', 'skillful'],
  'na-adjective:下手': ['へた', 'unskillful, poor', 'unskillful'],
  'na-adjective:不便': ['ふべん', 'inconvenience', ''],
  'na-adjective:不安': ['ふあん', 'anxiety, uneasiness', ''],
  'na-adjective:不満': ['ふまん', 'dissatisfaction, discontent, complaints', ''],
  'na-adjective:久しぶり': [
    'ひさしぶり',
    'it has been a long time; for the first time in a long time',
    '',
  ],
  'na-adjective:便利': ['べんり', 'convenient, handy', 'convenient'],
  'na-adjective:健康': ['けんこう', 'health(y)', ''],
  'na-adjective:元気': ['げんき', 'health(y), energetic', 'healthy / energetic'],
  'na-adjective:公平': ['こうへい', 'fairness, impartial, justice', ''],
  'na-adjective:別': ['べつ', 'distinction, different', ''],
  'na-adjective:十分': ['じゅうぶん', 'enough', ''],
  'na-adjective:危険': ['きけん', 'danger, risk, hazard', ''],
  'na-adjective:反対': ['はんたい', 'oppose, opposition, resistance', ''],
  'na-adjective:可能': ['かのう', 'possible, practicable, feasible', ''],
  'na-adjective:変': ['へん', 'strange, odd', ''],
  'na-adjective:大丈夫': [
    'だいじょうぶ',
    "It's ok (all right); No need to worry; Everything is under control",
    '',
  ],
  'na-adjective:大事': ['だいじ', 'important, valuable, serious matter', ''],
  'na-adjective:大切': ['たいせつ', 'important', ''],
  'na-adjective:大変': ['たいへん', 'very; difficult, hard', ''],
  'na-adjective:大好き': ['だいすき', 'very like-able, like very much', ''],
  'na-adjective:失礼': ['しつれい', 'discourtesy, impoliteness; Excuse me', ''],
  'na-adjective:好き': ['すき', 'liking, fondness, love', 'liked'],
  'na-adjective:嫌': ['いや', 'disagreeable, detestable, unpleasant', ''],
  'na-adjective:嫌い': ['きらい', 'dislike', 'disliked'],
  'na-adjective:安全': ['あんぜん', 'safety, security', ''],
  'na-adjective:平等': ['びょうどう', 'equality, impartiality, evenness', ''],
  'na-adjective:幸せ': ['しあわせ', 'happiness, blessing', ''],
  'na-adjective:幸福': ['こうふく', 'happiness, blessedness', ''],
  'na-adjective:心配': ['しんぱい', 'Worried, anxious', ''],
  'na-adjective:必要': ['ひつよう', 'necessary', ''],
  'na-adjective:快適': ['かいてき', 'pleasant, agreeable', ''],
  'na-adjective:急': ['きゅう', 'urgent, sudden; steep', ''],
  'na-adjective:新鮮': ['しんせん', 'fresh', ''],
  'na-adjective:明確': ['めいかく', 'clear, definite', ''],
  'na-adjective:普通': ['ふつう', 'common; usual', ''],
  'na-adjective:暇': ['ひま', 'free time, leisure', ''],
  'na-adjective:有名': ['ゆうめい', 'famous', ''],
  'na-adjective:本当': ['ほんと', 'truth, reality', ''],
  'na-adjective:楽しみ': ['たのしみ', 'pleasure, joy', ''],
  'na-adjective:正確': ['せいかく', 'accurate, punctuality, exact', ''],
  'na-adjective:残念': ['ざんねん', 'regret; regrettable', ''],
  'na-adjective:満足': ['まんぞく', 'satisfaction', ''],
  'na-adjective:無理': ['むり', 'unreasonable, impossible', ''],
  'na-adjective:熱心': ['ねっしん', 'enthusiasm', ''],
  'na-adjective:特別': ['とくべつ', 'special', ''],
  'na-adjective:盛ん': ['さかん', 'prosperous, active, thriving', ''],
  'na-adjective:真面目': ['まじめ', 'diligent, serious', ''],
  'na-adjective:確か': ['たしか', 'if I remember correctly; certain, definite', ''],
  'na-adjective:簡単': ['かんたん', 'simple', ''],
  'na-adjective:簡潔': ['かんけつ', 'brevity, concise, simple', ''],
  'na-adjective:結構': ['けっこう', 'splendid; enough, tolerably', ''],
  'na-adjective:綺麗': ['きれい', 'pretty, clean, tidy', ''],
  'na-adjective:自由': ['じゆう', 'freedom', ''],
  'na-adjective:色々': ['いろいろ', 'various', ''],
  'na-adjective:複雑': ['ふくざつ', 'complexity, complication', ''],
  'na-adjective:親切': ['しんせつ', 'kindness', ''],
  'na-adjective:豊か': ['ゆたか', 'abundant, wealthy, plentiful, rich', ''],
  'na-adjective:貧乏': ['びんぼう', 'poverty, destitute, poor', ''],
  'na-adjective:退屈': ['たいくつ', 'tedium, boring', ''],
  'na-adjective:適切': ['てきせつ', 'appropriate, adequate, relevance', ''],
  'na-adjective:適当': ['てきとう', 'fitness, suitability', ''],
  'na-adjective:邪魔': ['じゃま', 'hindrance, intrusion', ''],
  'na-adjective:重要': ['じゅうよう', 'important, essential', ''],
  'na-adjective:静か': ['しずか', 'quiet, calm', 'quiet'],
  'suru:けがする': ['けがする', 'injury (to animate object), hurt', ''],
  'suru:けんかする': ['けんかする', 'quarrel', ''],
  'suru:する': ['する', 'to do, to try; to wear small items (e.g., necktie, watch, etc.)', 'to do'],
  'suru:びっくりする': ['びっくりする', 'to be surprised', ''],
  'suru:ゆにゅうする': ['ゆにゅうする', 'Import', ''],
  'suru:コピーする': ['コピーする', 'to copy', ''],
  'suru:チェックする': ['チェックする', 'check', ''],
  'suru:世話する': ['せわする', 'looking after; to look after', ''],
  'suru:予約する': ['よやくする', 'Reserve, Book', ''],
  'suru:予習する': ['よしゅうする', "Prepare one's lesson", ''],
  'suru:修理する': ['しゅりする', 'Repair', ''],
  'suru:入学する': ['にゅうがくする', 'entry to school or university', ''],
  'suru:入院する': ['にゅういんする', 'hospitalization', ''],
  'suru:出席する': ['しゅっせきする', 'attendance', ''],
  'suru:出発する': ['しゅっぱつする', 'departure', ''],
  'suru:勉強する': ['べんきょうする', 'Study', ''],
  'suru:卒業する': ['そつぎょうする', 'Graduate from (a university)', ''],
  'suru:参加する': ['さんかする', 'Attend', ''],
  'suru:失敗する': ['しっぱいする', 'Fail (an examination）', ''],
  'suru:安心する': ['あんしんする', 'Be relieved', ''],
  'suru:復習する': ['ふくしゅうする', "Review one's lesson", ''],
  'suru:心配する': ['しんぱいする', 'worry, concern', ''],
  'suru:承知する': ['しょうちする', 'consent, acceptance', ''],
  'suru:招待する': ['しょうたいする', 'invitation', ''],
  'suru:拝見する': ['はいけんする', '(humble) (polite) seeing, look at', ''],
  'suru:掃除する': ['そうじする', 'to clean (a room)', ''],
  'suru:支度する': ['したくする', 'preparation', ''],
  'suru:放送する': ['ほうそうする', 'broadcasting', ''],
  'suru:故障する': ['こしょうする', 'breakdown', ''],
  'suru:散歩する': ['さんぽする', 'Take a walk', ''],
  'suru:整理する': ['せいりする', 'Put (things) in order, tidy up', ''],
  'suru:案内する': ['あんないする', 'information, guidance', ''],
  'suru:注意する': ['ちゅういする', 'to be careful', ''],
  'suru:洗濯する': ['せんたくする', 'Wash (Clothes)', ''],
  'suru:準備する': ['じゅんびする', 'prepare', ''],
  'suru:生活する': ['せいかつする', 'living, life; to live', ''],
  'suru:生産する': ['せいさんする', 'production; to produce', ''],
  'suru:用意する': ['よういする', 'to prepare', ''],
  'suru:相談する': ['そうだんする', 'consultation', ''],
  'suru:研究する': ['けんきゅうする', 'to research', ''],
  'suru:競走する': ['きょうそうする', 'Race', ''],
  'suru:紹介する': ['しょうかいする', 'Introduce', ''],
  'suru:経験する': ['けいけんする', 'experience', ''],
  'suru:結婚する': ['けっこんする', 'Get married', ''],
  'suru:緊張する': ['きんちょうする', 'Become tense, Be strained', ''],
  'suru:練習する': ['れんしゅうする', 'Practice', ''],
  'suru:翻訳する': ['ほんやくする', 'Translate', ''],
  'suru:計画する': ['けいかくする', 'plan, project, schedule', ''],
  'suru:説明する': ['せつめいする', 'Explain', ''],
  'suru:買い物する': ['かいものする', 'Do shopping', ''],
  'suru:輸出する': ['ゆしゅつする', 'export', ''],
  'suru:退院する': ['たいいんする', 'leaving hospital', ''],
  'suru:連絡する': ['れんらくする', 'Contact', ''],
  'suru:運動する': ['うんどうする', 'exercise', ''],
  'suru:運転する': ['うんてんする', 'driving', ''],
  'suru:遠慮する': ['えんりょする', 'restraint, reserve, hesitate', ''],
  'suru:電話する': ['でんわする', 'Phone', ''],
  'suru:食事する': ['しょくじする', 'meal', ''],
});
