#!/usr/bin/env python3
"""
智能数据集构建器 - AI驱动的自主图片生成系统

这个脚本使用LLM作为"大脑"来：
1. 理解用户需求并制定生成策略
2. 自主设计多样化的场景和风格
3. 动态调整参数以优化质量
4. 智能处理错误和重试
5. 生成完整的数据集文档

使用方法:
    python smart_dataset_builder.py "我想要一个高质量的自然风景数据集，包含不同季节和时间"
    python smart_dataset_builder.py "生成50张电商产品图，适合展示各类商品"
    python smart_dataset_builder.py "创建人像摄影数据集，多种风格和光线"

作者: Matrix Labs
日期: 2026-03-09
"""

import requests
import json
import time
import os
import sys
from datetime import datetime
from pathlib import Path
import re

# API配置
LLM_API = "http://127.0.0.1:38025/api/chat"
P2P_API = "http://127.0.0.1:38024/api/generate"
ACCESS_CODE = "ptp2025"

# 输出目录
OUTPUT_DIR = Path("./ai_generated_dataset")


class SmartDatasetBuilder:
    """AI驱动的智能数据集构建器"""
    
    def __init__(self, user_request):
        self.user_request = user_request
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.output_dir = OUTPUT_DIR / self.session_id
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.log_file = self.output_dir / "build_log.txt"
        self.strategy = None
        self.prompts = []
        self.results = []
        
        self.log("=" * 80)
        self.log("🤖 智能数据集构建器启动")
        self.log("=" * 80)
        self.log(f"用户需求: {user_request}")
        self.log(f"会话ID: {self.session_id}")
        self.log(f"输出目录: {self.output_dir.absolute()}")
        self.log("")
    
    def log(self, message):
        """记录日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_msg = f"[{timestamp}] {message}"
        print(log_msg)
        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(log_msg + '\n')
    
    def ask_llm(self, system_prompt, user_message, temperature=0.7):
        """调用LLM获取智能决策"""
        try:
            response = requests.post(
                LLM_API,
                json={
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message}
                    ],
                    "temperature": temperature,
                    "max_tokens": 4096
                },
                timeout=120
            )
            
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
            else:
                self.log(f"⚠️  LLM API错误: {response.status_code}")
                return None
        except Exception as e:
            self.log(f"⚠️  LLM调用失败: {str(e)}")
            return None
    
    def phase1_understand_and_plan(self):
        """阶段1: 理解需求并制定策略"""
        self.log("\n" + "=" * 80)
        self.log("📋 阶段1: AI分析需求并制定生成策略")
        self.log("=" * 80)
        
        system_prompt = """你是一个专业的AI数据集架构师。你的任务是分析用户需求，制定智能的图片生成策略。

你需要输出一个JSON格式的策略，包含：
1. dataset_name: 数据集名称
2. description: 数据集描述
3. target_count: 建议生成的图片数量（根据需求复杂度，10-100张）
4. image_specs: 图片规格（重要：必须使用以下参数）
   - width: 宽度（推荐：1024或1408）
   - height: 高度（推荐：1024或1408）
   - steps: 生成步数（必须是4，这是Flux2 Klein的最优值）
   - cfg: CFG值（必须是1.0，这是Flux2 Klein的最优值）
5. categories: 图片分类列表，每个分类包含：
   - name: 分类名称
   - count: 该分类的图片数量
   - description: 分类描述
   - style_keywords: 风格关键词列表
6. quality_requirements: 质量要求说明

重要提示：
- steps必须设置为4（Flux2 Klein专门优化的步数）
- cfg必须设置为1.0（Flux2 Klein的最佳CFG值）
- 不要使用更高的steps或cfg，这会降低质量

请根据用户需求，输出完整的JSON策略。只输出JSON，不要有其他文字。"""

        response = self.ask_llm(system_prompt, self.user_request, temperature=0.3)
        
        if not response:
            self.log("❌ 策略制定失败")
            return False
        
        # 提取JSON
        try:
            # 尝试找到JSON块
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                self.strategy = json.loads(json_match.group())
            else:
                self.strategy = json.loads(response)
            
            # 保存策略
            with open(self.output_dir / "strategy.json", 'w', encoding='utf-8') as f:
                json.dump(self.strategy, f, indent=2, ensure_ascii=False)
            
            self.log("✅ 策略制定完成:")
            self.log(f"   数据集: {self.strategy['dataset_name']}")
            self.log(f"   描述: {self.strategy['description']}")
            self.log(f"   目标数量: {self.strategy['target_count']} 张")
            self.log(f"   分辨率: {self.strategy['image_specs']['width']}x{self.strategy['image_specs']['height']}")
            self.log(f"   分类数: {len(self.strategy['categories'])} 个")
            
            for cat in self.strategy['categories']:
                self.log(f"      - {cat['name']}: {cat['count']}张")
            
            return True
            
        except Exception as e:
            self.log(f"❌ 策略解析失败: {str(e)}")
            self.log(f"   LLM响应: {response[:200]}...")
            return False
    
    def phase2_generate_prompts(self):
        """阶段2: 生成高质量提示词"""
        self.log("\n" + "=" * 80)
        self.log("✨ 阶段2: AI生成创意提示词")
        self.log("=" * 80)
        
        for category in self.strategy['categories']:
            self.log(f"\n📝 生成分类: {category['name']} ({category['count']}张)")
            
            system_prompt = f"""你是一个顶级的AI图像生成提示词专家，专门为Flux2模型编写高质量提示词。

分类信息:
- 名称: {category['name']}
- 描述: {category['description']}
- 风格关键词: {', '.join(category['style_keywords'])}
- 数量: {category['count']}

参考示例（这是高质量提示词的标准）:
1. "A vintage motorcycle parked in front of a retro diner at sunset, warm orange and pink sky, neon signs glowing, 80s vintage photo style, film grain, warm color cast"
2. "Professional portrait photography, beautiful young woman, natural soft lighting, shallow depth of field, bokeh background, elegant and refined, fashion photography style, high-end beauty shot, professional studio quality, cinematic color grading"

关键要求:
1. 必须包含的元素:
   - 主体描述（具体、详细）
   - 场景/环境（氛围感）
   - 光线描述（golden hour, soft lighting, dramatic lighting等）
   - 摄影风格（vintage, cinematic, professional photography等）
   - 技术细节（film grain, bokeh, shallow depth of field, 8k quality等）
   - 色彩氛围（warm tones, cool blue, vibrant colors等）
   - 艺术风格（如果适用：impressionist, realistic, artistic等）

2. 提示词结构:
   [主体] + [场景/环境] + [光线] + [构图/角度] + [风格] + [技术细节] + [氛围/情绪]

3. 专业术语使用:
   - 光线: golden hour, blue hour, soft diffused light, dramatic lighting, rim light, backlit
   - 摄影: shallow depth of field, bokeh, macro shot, wide angle, telephoto, long exposure
   - 风格: cinematic, vintage, film photography, professional photography, artistic
   - 质量: 8k quality, high detail, ultra realistic, photorealistic, sharp focus
   - 胶片感: film grain, analog photography, vintage photo, retro aesthetic

4. 多样性要求:
   - 不同的时间（sunrise, noon, sunset, twilight, night）
   - 不同的天气（clear sky, overcast, misty, foggy, stormy）
   - 不同的角度（aerial view, ground level, close-up, panoramic）
   - 不同的风格（realistic, artistic, vintage, modern, cinematic）

5. 每个提示词50-120词，用英文，格式: PROMPT: [内容]

直接输出 {category['count']} 个高质量提示词，每行一个，以PROMPT:开头。确保每个都像示例一样专业、详细、富有视觉冲击力。"""

            response = self.ask_llm(
                system_prompt,
                f"请为'{category['name']}'生成{category['count']}个多样化的图像提示词",
                temperature=0.9
            )
            
            if not response:
                self.log(f"   ⚠️  该分类提示词生成失败，跳过")
                continue
            
            # 提取提示词
            lines = response.split('\n')
            category_prompts = []
            
            for line in lines:
                line = line.strip()
                if line.startswith('PROMPT:'):
                    prompt = line[7:].strip()
                    if len(prompt) > 30:
                        category_prompts.append({
                            'category': category['name'],
                            'prompt': prompt,
                            'style_keywords': category['style_keywords']
                        })
            
            self.prompts.extend(category_prompts)
            self.log(f"   ✅ 生成了 {len(category_prompts)} 个提示词")
        
        # 保存所有提示词
        with open(self.output_dir / "prompts.json", 'w', encoding='utf-8') as f:
            json.dump(self.prompts, f, indent=2, ensure_ascii=False)
        
        self.log(f"\n✅ 总共生成 {len(self.prompts)} 个提示词")
        return len(self.prompts) > 0
    
    def phase3_generate_images(self):
        """阶段3: 批量生成图片"""
        self.log("\n" + "=" * 80)
        self.log("🎨 阶段3: 批量生成图片")
        self.log("=" * 80)
        
        specs = self.strategy['image_specs']
        total = len(self.prompts)
        success = 0
        failed = 0
        
        for i, item in enumerate(self.prompts):
            self.log(f"\n[{i+1}/{total}] 生成图片...")
            self.log(f"   分类: {item['category']}")
            self.log(f"   提示词: {item['prompt'][:80]}...")
            
            try:
                response = requests.post(
                    P2P_API,
                    json={
                        "prompt": item['prompt'],
                        "width": specs['width'],
                        "height": specs['height'],
                        "steps": specs['steps'],
                        "cfg": specs['cfg'],
                        "accessCode": ACCESS_CODE
                    },
                    timeout=300
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get('success'):
                        result = {
                            'index': i,
                            'category': item['category'],
                            'prompt': item['prompt'],
                            'image_url': data['image'],
                            'thumbnail_url': data['thumbnail'],
                            'seed': data.get('seed'),
                            'timestamp': datetime.now().isoformat()
                        }
                        self.results.append(result)
                        success += 1
                        self.log(f"   ✅ 成功: {data['image']}")
                    else:
                        failed += 1
                        self.log(f"   ❌ 失败: {data.get('error', 'Unknown')}")
                elif response.status_code == 402:
                    error = response.json()
                    self.log(f"   ❌ 积分不足: 需要{error.get('required')}，剩余{error.get('credits')}")
                    self.log("   ⚠️  停止生成")
                    break
                else:
                    failed += 1
                    self.log(f"   ❌ API错误: {response.status_code}")
                
            except Exception as e:
                failed += 1
                self.log(f"   ❌ 异常: {str(e)}")
            
            # 避免过载
            if i < total - 1:
                time.sleep(2)
        
        self.log(f"\n✅ 生成完成: 成功 {success}/{total}, 失败 {failed}")
        
        # 保存结果
        with open(self.output_dir / "results.json", 'w', encoding='utf-8') as f:
            json.dump({
                'session_id': self.session_id,
                'strategy': self.strategy,
                'total': total,
                'success': success,
                'failed': failed,
                'results': self.results
            }, f, indent=2, ensure_ascii=False)
        
        return success > 0
    
    def phase4_generate_documentation(self):
        """阶段4: 生成数据集文档"""
        self.log("\n" + "=" * 80)
        self.log("📄 阶段4: AI生成数据集文档")
        self.log("=" * 80)
        
        system_prompt = """你是一个专业的技术文档撰写专家。根据提供的数据集信息，生成一份完整的README.md文档。

文档应包含:
1. 数据集标题和简介
2. 数据集统计信息
3. 分类说明
4. 使用方法
5. 技术规格
6. 许可和引用

使用Markdown格式，专业、清晰、易读。"""

        summary = {
            'dataset_name': self.strategy['dataset_name'],
            'description': self.strategy['description'],
            'total_images': len(self.results),
            'categories': {},
            'specs': self.strategy['image_specs']
        }
        
        for result in self.results:
            cat = result['category']
            if cat not in summary['categories']:
                summary['categories'][cat] = 0
            summary['categories'][cat] += 1
        
        response = self.ask_llm(
            system_prompt,
            f"请为以下数据集生成README.md文档:\n\n{json.dumps(summary, indent=2, ensure_ascii=False)}",
            temperature=0.5
        )
        
        if response:
            with open(self.output_dir / "README.md", 'w', encoding='utf-8') as f:
                f.write(response)
            self.log("✅ 文档生成完成: README.md")
        else:
            self.log("⚠️  文档生成失败")
        
        # 生成图片索引HTML
        self.generate_html_index()
    
    def generate_html_index(self):
        """生成HTML图片索引"""
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self.strategy['dataset_name']}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 20px; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ font-size: 32px; margin-bottom: 10px; }}
        .stats {{ color: #666; margin-bottom: 30px; }}
        .gallery {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }}
        .item {{ background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .item img {{ width: 100%; height: 300px; object-fit: cover; }}
        .item .info {{ padding: 15px; }}
        .item .category {{ font-size: 12px; color: #999; margin-bottom: 5px; }}
        .item .prompt {{ font-size: 14px; color: #333; line-height: 1.5; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{self.strategy['dataset_name']}</h1>
        <div class="stats">
            {self.strategy['description']}<br>
            总计: {len(self.results)} 张图片 | 分辨率: {self.strategy['image_specs']['width']}x{self.strategy['image_specs']['height']}
        </div>
        <div class="gallery">
"""
        
        for result in self.results:
            html += f"""
            <div class="item">
                <img src="http://127.0.0.1:38024{result['thumbnail_url']}" alt="{result['category']}">
                <div class="info">
                    <div class="category">{result['category']}</div>
                    <div class="prompt">{result['prompt'][:150]}...</div>
                </div>
            </div>
"""
        
        html += """
        </div>
    </div>
</body>
</html>
"""
        
        with open(self.output_dir / "index.html", 'w', encoding='utf-8') as f:
            f.write(html)
        
        self.log("✅ HTML索引生成完成: index.html")
    
    def run(self):
        """运行完整的智能构建流程"""
        try:
            # 阶段1: 理解需求并制定策略
            if not self.phase1_understand_and_plan():
                return False
            
            # 阶段2: 生成提示词
            if not self.phase2_generate_prompts():
                return False
            
            # 阶段3: 生成图片
            if not self.phase3_generate_images():
                return False
            
            # 阶段4: 生成文档
            self.phase4_generate_documentation()
            
            # 最终报告
            self.log("\n" + "=" * 80)
            self.log("🎉 数据集构建完成!")
            self.log("=" * 80)
            self.log(f"数据集名称: {self.strategy['dataset_name']}")
            self.log(f"图片总数: {len(self.results)}")
            self.log(f"输出目录: {self.output_dir.absolute()}")
            self.log(f"查看索引: file://{self.output_dir.absolute()}/index.html")
            self.log("=" * 80)
            
            return True
            
        except KeyboardInterrupt:
            self.log("\n⚠️  用户中断")
            return False
        except Exception as e:
            self.log(f"\n❌ 构建失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return False


def main():
    if len(sys.argv) < 2:
        print("""
🤖 智能数据集构建器 - AI驱动的自主图片生成系统

使用方法:
    python smart_dataset_builder.py "你的需求描述"

示例:
    python smart_dataset_builder.py "我想要一个高质量的自然风景数据集，包含不同季节和时间"
    python smart_dataset_builder.py "生成50张电商产品图，适合展示各类商品"
    python smart_dataset_builder.py "创建人像摄影数据集，多种风格和光线"
    python smart_dataset_builder.py "建筑摄影数据集，现代和古典建筑，不同角度"

特点:
    ✨ AI自主理解需求并制定策略
    🎨 智能生成多样化的创意提示词
    📊 自动分类和组织数据集
    📄 生成完整的文档和索引
    🔄 智能错误处理和重试
        """)
        sys.exit(1)
    
    user_request = " ".join(sys.argv[1:])
    builder = SmartDatasetBuilder(user_request)
    success = builder.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
