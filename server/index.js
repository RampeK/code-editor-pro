const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { PythonShell } = require('python-shell');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// Väliaikainen tallennus muistiin
const projectStore = new Map();

app.use(cors());
app.use(express.json());

// Luo väliaikainen tiedosto koodin suoritusta varten
async function createTempFiles(files, projectId) {
  const projectDir = path.join(__dirname, 'temp', projectId);
  await fs.mkdir(projectDir, { recursive: true });

  for (const file of files) {
    await fs.writeFile(path.join(projectDir, file.name), file.value);
  }

  return projectDir;
}

// Lisää tuetut kielet ja tiedostopäätteet
const SUPPORTED_LANGUAGES = {
  'js': 'node',
  'py': 'python'
};

// Lisää nämä vakiot tiedoston alkuun
const CODE_PATTERNS = {
  js: {
    complexity: {
      forLoop: /for\s*\(/g,
      whileLoop: /while\s*\(/g,
      ifStatement: /if\s*\(/g,
      recursion: /function\s+\w+[\s\S]*?\1\s*\(/g,
    },
    badPractices: {
      eval: /eval\s*\(/g,
      globalVars: /^(?!.*(?:const|let|var|function|class))\s*\w+\s*=/gm,
      magicNumbers: /(?<!(?:const|let|var)\s+\w+\s*=\s*)\b\d+\b(?!\s*[;,]?\s*(?:\/\/|\/\*))/g,
    },
    style: {
      camelCase: /[a-z][a-zA-Z0-9]+[A-Z][a-zA-Z0-9]*/g,
      longLines: /.{100,}/g,
      emptyBlocks: /{\s*}/g,
    }
  },
  py: {
    complexity: {
      forLoop: /for\s+\w+\s+in/g,
      whileLoop: /while\s*:/g,
      ifStatement: /if\s+.*:/g,
      recursion: /def\s+(\w+)[\s\S]*?\1\s*\(/g,
    },
    badPractices: {
      globalVars: /^[A-Z][A-Z0-9_]*\s*=/gm,
      magicNumbers: /(?<!(?:=|\+|-|\*|\/)\s*)\b\d+\b(?!\s*[;,]?\s*#)/g,
      exec: /exec\s*\(/g,
    },
    style: {
      snakeCase: /[a-z][a-z0-9]+[A-Z]/g,
      longLines: /.{80,}/g,
      emptyBlocks: /:\s*pass\s*$/gm,
    }
  },
  html: {
    complexity: {
      nestedElements: /<[^>]+>(?:[^<]*<[^>]+>){4,}[^<]*<\/[^>]+>/g, // Syvät sisäkkäiset elementit
      longElements: /<[^>]{80,}>/g, // Pitkät elementit
    },
    badPractices: {
      inlineStyles: /style=["'][^"']+["']/g,
      deprecatedTags: /<(font|center|strike|marquee|blink)[^>]*>/gi,
      missingAlt: /<img[^>]+(?!alt=)[^>]*>/g,
    },
    style: {
      inconsistentQuotes: /("[^"]*'[^"]*"|'[^']*"[^']*')/g,
      missingDoctype: /^(?!<!DOCTYPE)/i,
      nonSemanticDivs: /<div[^>]*class=["'](?:header|footer|nav|main|article)[^"']*["'][^>]*>/gi,
    }
  },
  css: {
    complexity: {
      deepSelectors: /[^\s,{][^\s,{]*(?:\s+[^\s,{][^\s,{]*){3,}(?=\s*\{)/g, // Liian syvät selektorit
      longRules: /\{[^}]{200,}\}/g, // Pitkät säännöt
    },
    badPractices: {
      importantRules: /!important/g,
      hardcodedColors: /#[a-fA-F0-9]{3,6}|rgb\([^)]+\)/g,
      oldPrefixes: /-(?:webkit|moz|ms|o)-/g,
    },
    style: {
      inconsistentUnits: /\d+(?:px|em|rem|vh|vw|%)/g,
      duplicateSelectors: /([^{]+\{[^}]*\})(?=[\s\S]*\1)/g,
    }
  }
};

const analyzeCode = (code, language) => {
  const patterns = CODE_PATTERNS[language];
  const analysis = {
    complexity: 0,
    suggestions: [],
    goodPractices: [],
    warnings: []
  };

  // Analysoi koodin monimutkaisuutta
  const complexityScore = Object.entries(patterns.complexity)
    .reduce((score, [type, pattern]) => {
      const matches = (code.match(pattern) || []).length;
      if (matches > 0) {
        if (type === 'recursion') {
          analysis.suggestions.push('🔄 Rekursiivinen funktio havaittu. Varmista että lopetusehdot ovat kunnossa.');
        }
        return score + matches;
      }
      return score;
    }, 0);

  analysis.complexity = complexityScore;

  // Tarkista huonot käytännöt
  Object.entries(patterns.badPractices).forEach(([type, pattern]) => {
    const matches = (code.match(pattern) || []).length;
    if (matches > 0) {
      switch (type) {
        case 'eval':
          analysis.warnings.push('⚠️ eval() käyttö on riskialtista ja voi aiheuttaa tietoturvaongelmia.');
          break;
        case 'globalVars':
          analysis.warnings.push('⚠️ Globaalien muuttujien käyttö voi aiheuttaa ongelmia. Harkitse muuttujien kapselointia.');
          break;
        case 'magicNumbers':
          analysis.suggestions.push('💡 Koodissa on "maagisia numeroita". Harkitse vakioiden käyttöä selkeyden vuoksi.');
          break;
      }
    }
  });

  // Tarkista tyyliohjeet
  Object.entries(patterns.style).forEach(([type, pattern]) => {
    const matches = (code.match(pattern) || []).length;
    if (matches > 0) {
      switch (type) {
        case 'camelCase':
        case 'snakeCase':
          analysis.suggestions.push(`📝 Tarkista muuttujien nimeämiskäytännöt (${language === 'js' ? 'camelCase' : 'snake_case'}).`);
          break;
        case 'longLines':
          analysis.suggestions.push('📏 Koodissa on pitkiä rivejä. Harkitse koodin pilkkomista luettavuuden parantamiseksi.');
          break;
        case 'emptyBlocks':
          analysis.warnings.push('⚠️ Koodissa on tyhjiä lohkoja. Varmista että tämä on tarkoituksellista.');
          break;
      }
    }
  });

  // Tarkista hyvät käytännöt
  if (language === 'js') {
    if (code.includes('const ')) {
      analysis.goodPractices.push('✅ const käyttö muuttumattomille arvoille on hyvä käytäntö.');
    }
    if (code.includes('try') && code.includes('catch')) {
      analysis.goodPractices.push('✅ Virheenkäsittely try-catch -lauseilla on toteutettu.');
    }
  } else if (language === 'py') {
    if (code.includes('def ')) {
      analysis.goodPractices.push('✅ Koodin jakaminen funktioihin parantaa uudelleenkäytettävyyttä.');
    }
    if (code.includes('if __name__ == "__main__":')) {
      analysis.goodPractices.push('✅ Pääohjelman erottaminen on hyvä käytäntö.');
    }
  }

  // Tarkista kommentointi
  const commentLines = (code.match(language === 'js' ? /\/\/.+|\/\*.+?\*\//g : /#.+/g) || []).length;
  const codeLines = code.split('\n').length;
  const commentRatio = commentLines / codeLines;

  if (commentRatio < 0.1) {
    analysis.suggestions.push('📚 Lisää kommentteja koodin dokumentoimiseksi.');
  } else if (commentRatio > 0.4) {
    analysis.suggestions.push('📚 Koodissa on paljon kommentteja. Varmista että koodi on itsedokumentoivaa.');
  }

  // HTML-spesifiset tarkistukset
  if (language === 'html') {
    // Tarkista doctype
    if (patterns.style.missingDoctype.test(code)) {
      analysis.warnings.push('⚠️ DOCTYPE-määrittely puuttuu dokumentin alusta.');
    }

    // Tarkista saavutettavuus
    const missingAltCount = (code.match(patterns.badPractices.missingAlt) || []).length;
    if (missingAltCount > 0) {
      analysis.warnings.push('⚠️ Kuvista puuttuu alt-tekstejä. Tämä heikentää saavutettavuutta.');
    }

    // Tarkista vanhentuneet tagit
    const deprecatedCount = (code.match(patterns.badPractices.deprecatedTags) || []).length;
    if (deprecatedCount > 0) {
      analysis.warnings.push('⚠️ Koodissa käytetään vanhentuneita HTML-tageja.');
    }

    // Tarkista inline-tyylit
    const inlineStyleCount = (code.match(patterns.badPractices.inlineStyles) || []).length;
    if (inlineStyleCount > 0) {
      analysis.suggestions.push('💡 Vältä inline-tyylien käyttöä. Siirrä tyylit CSS-tiedostoon.');
    }

    // Tarkista semanttiset elementit
    const nonSemanticCount = (code.match(patterns.style.nonSemanticDivs) || []).length;
    if (nonSemanticCount > 0) {
      analysis.suggestions.push('💡 Käytä semanttisia elementtejä (header, nav, main, etc.) div-elementtien sijaan.');
    }

    // Hyvät käytännöt
    if (code.includes('aria-')) {
      analysis.goodPractices.push('✅ ARIA-attribuuttien käyttö parantaa saavutettavuutta.');
    }
    if (code.includes('<meta name="viewport"')) {
      analysis.goodPractices.push('✅ Viewport meta -tagi löytyy (mobiiliresponsiivisuus).');
    }
  }

  // CSS-spesifiset tarkistukset
  if (language === 'css') {
    // Tarkista !important -käyttö
    const importantCount = (code.match(patterns.badPractices.importantRules) || []).length;
    if (importantCount > 0) {
      analysis.warnings.push('⚠️ !important -määreiden käyttö voi aiheuttaa ongelmia ylläpidettävyydessä.');
    }

    // Tarkista kovakoodatut värit
    const colorCount = (code.match(patterns.badPractices.hardcodedColors) || []).length;
    if (colorCount > 3) {
      analysis.suggestions.push('💡 Käytä CSS-muuttujia (variables) toistuvien väriarvojen sijaan.');
    }

    // Tarkista selektorien syvyys
    const deepSelectorsCount = (code.match(patterns.complexity.deepSelectors) || []).length;
    if (deepSelectorsCount > 0) {
      analysis.suggestions.push('💡 Vältä liian syviä selektoreita. Ne tekevät CSS:stä vaikeasti ylläpidettävää.');
    }

    // Tarkista vanhat selainprefiksit
    const prefixCount = (code.match(patterns.badPractices.oldPrefixes) || []).length;
    if (prefixCount > 0) {
      analysis.suggestions.push('💡 Harkitse autoprefixer-työkalun käyttöä selainprefiksien hallintaan.');
    }

    // Hyvät käytännöt
    if (code.includes('@media')) {
      analysis.goodPractices.push('✅ Media queryjen käyttö parantaa responsiivisuutta.');
    }
    if (code.includes('var(--')) {
      analysis.goodPractices.push('✅ CSS-muuttujien käyttö helpottaa ylläpitoa.');
    }
  }

  return analysis;
};

// Muokkaa execute endpointia
app.post('/api/execute', async (req, res) => {
  const projectId = uuidv4();
  try {
    const { files } = req.body;
    const projectDir = await createTempFiles(files, projectId);

    // Etsi suoritettava tiedosto
    const mainFile = files.find(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return SUPPORTED_LANGUAGES[ext];
    });

    if (!mainFile) {
      return res.status(400).json({ error: 'Ei suoritettavaa tiedostoa.' });
    }

    const fileExtension = mainFile.name.split('.').pop().toLowerCase();
    const filePath = path.join(projectDir, mainFile.name);

    try {
      let output = '';
      if (fileExtension === 'py') {
        // Python-koodin suoritus
        const pyshell = new PythonShell(filePath);
        await new Promise((resolve, reject) => {
          pyshell.on('message', (message) => {
            output += message + '\n';
          });
          pyshell.on('stderr', (stderr) => {
            output += 'Virhe: ' + stderr + '\n';
          });
          pyshell.end((err) => {
            if (err) reject(err);
            resolve();
          });
        });
      } else {
        // JavaScript-koodin suoritus
        const { stdout, stderr } = await new Promise((resolve, reject) => {
          exec(`node ${filePath}`, {
            timeout: 5000,
            maxBuffer: 1024 * 1024
          }, (error, stdout, stderr) => {
            if (error && !stderr) {
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          });
        });
        output = stderr || stdout;
      }

      await fs.rm(projectDir, { recursive: true, force: true });
      res.json({ output: output.trim() });
    } catch (error) {
      res.status(400).json({ error: `Virhe koodin suorituksessa: ${error.message}` });
    }
  } catch (error) {
    res.status(500).json({ error: 'Palvelinvirhe koodin suorituksessa' });
  }
});

// Tallenna projekti
app.post('/api/projects/save', (req, res) => {
  const id = uuidv4();
  projectStore.set(id, req.body.files);
  res.json({ id });
});

// Hae projekti
app.get('/api/projects/:id', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (project) {
    res.json({ files: project });
  } else {
    res.status(404).json({ error: 'Projektia ei löytynyt' });
  }
});

// Analysoi koodi
app.post('/api/analyze', async (req, res) => {
  try {
    const { files, language } = req.body;
    const fileToAnalyze = files[0];
    
    if (!fileToAnalyze) {
      return res.status(400).json({ error: 'Ei analysoitavaa tiedostoa.' });
    }

    // Määritä oikea kielityyppi tiedostopäätteen perusteella
    const fileExtension = fileToAnalyze.name.split('.').pop().toLowerCase();
    const languageMap = {
      'js': 'js',
      'py': 'py',
      'html': 'html',
      'css': 'css'
    };

    const analysisLanguage = languageMap[fileExtension];
    if (!analysisLanguage) {
      return res.status(400).json({ error: 'Tiedostotyyppiä ei tueta analyysissä.' });
    }

    const analysis = analyzeCode(fileToAnalyze.value, analysisLanguage);
    
    // Muodosta selkeä palaute
    let feedback = [];
    
    // Lisää hyvät käytännöt
    if (analysis.goodPractices.length > 0) {
      feedback.push('💪 Hyvät käytännöt:');
      feedback.push(...analysis.goodPractices);
    }
    
    // Lisää varoitukset
    if (analysis.warnings.length > 0) {
      feedback.push('\n⚠️ Varoitukset:');
      feedback.push(...analysis.warnings);
    }
    
    // Lisää parannusehdotukset
    if (analysis.suggestions.length > 0) {
      feedback.push('\n💡 Parannusehdotukset:');
      feedback.push(...analysis.suggestions);
    }

    // Jos ei löytynyt mitään huomautettavaa
    if (feedback.length === 0) {
      feedback.push('✅ Koodi näyttää hyvältä! Ei huomautettavaa.');
    }

    res.json({ feedback: feedback.join('\n') });
  } catch (error) {
    res.status(500).json({ error: 'Virhe koodin analysoinnissa: ' + error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Palvelin käynnissä portissa ${PORT}`);
});