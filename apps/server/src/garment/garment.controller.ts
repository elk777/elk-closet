/**
 * 衣物控制器：录入生命线的对外接口（PRD 4.1）。
 *
 * 全部受 JwtAuthGuard 保护，衣物归属当前登录用户。
 * 录入两步：先 recognize 拿 AI 预填 → 用户确认 → create 入库；
 * 或跳过识别直接 create（先存图后补）。
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { CreateGarmentDto } from './dto/create-garment.dto';
import { CutoutGarmentDto } from './dto/cutout-garment.dto';
import { ExtractScreenshotDto } from './dto/extract-screenshot.dto';
import { RecognizeGarmentDto } from './dto/recognize-garment.dto';
import { SetArchivedDto } from './dto/set-archived.dto';
import { GarmentService } from './garment.service';

@Controller('garments')
@UseGuards(JwtAuthGuard)
export class GarmentController {
  constructor(private readonly garments: GarmentService) {}

  /**
   * AI 识别衣物属性，不入库（供确认页预填）。
   *
   * 三态返回，前端据 reason 分流（与 extract-screenshot 同构）：
   * - recognized=true：识别到衣物，进确认页预填
   * - reason='irrelevant'：模型判定图中没有衣物，前端拦下不弹表单
   * - reason='error'：技术故障，仍走「先存图后补」进确认页手填，
   *   生命线不被 AI 波动阻断（PRD 5.6）
   * @param user 当前登录用户（品类候选集按其分类表拼装）
   * @param dto 已上传的衣物图 URL
   * @returns 识别结果，或带 reason 的失败标记
   */
  @Post('recognize')
  async recognize(@CurrentUser() user: User, @Body() dto: RecognizeGarmentDto) {
    try {
      const { result, notGarment } = await this.garments.recognize(
        user.id,
        dto.imageUrl,
      );
      if (notGarment) {
        return {
          recognized: false,
          reason: 'irrelevant',
          message: '这张图里没看到衣物，请拍一件衣服或配饰',
        };
      }
      return { recognized: true, result };
    } catch {
      // 技术故障降级：告知前端可只存图后补，不阻塞录入
      return {
        recognized: false,
        reason: 'error',
        message: '识别失败，可先存图稍后补充属性',
      };
    }
  }

  /**
   * 从购物截图提取商品信息，不入库（供确认页预填，PRD 4.1 截图导入）。
   *
   * 三态返回，前端据 reason 分流：
   * - extracted=true：读到商品信息，进确认页预填
   * - reason='irrelevant'：模型判定不是购物页面，前端拦下不弹表单
   * - reason='error'：技术故障（无 vision / 图不可达 / 主备均失败），
   *   仍走「先存截图稍后补」进确认页手填——公益站网关不稳，不能让超时堵死录入
   * @param user 当前登录用户（品类候选集按其分类表拼装）
   * @param dto 已上传的截图 URL（1~3 张）
   * @returns 提取结果 + 裁出的商品图 URL，或带 reason 的失败标记
   */
  @Post('extract-screenshot')
  async extractScreenshot(
    @CurrentUser() user: User,
    @Body() dto: ExtractScreenshotDto,
  ) {
    try {
      const { result, croppedImageUrl, irrelevant } =
        await this.garments.extractScreenshot(user.id, dto.imageUrls);
      if (irrelevant) {
        return {
          extracted: false,
          reason: 'irrelevant',
          message: '这几张图里没找到商品信息，请选订单页或商品详情页截图',
        };
      }
      return { extracted: true, result, croppedImageUrl };
    } catch {
      return {
        extracted: false,
        reason: 'error',
        message: '没读出商品信息，可先存截图稍后补充',
      };
    }
  }

  /**
   * 对拍照/选图的实物图抠图去背景，产出白底主图 URL，不入库（供确认页预览 + create 落 cutoutImageUrl）。
   *
   * 与识别正交、前端并行调用；抠图不理想/失败返回 cutoutImageUrl=null，
   * 前端回退原图、不阻塞录入（cutoutGarment 内部已全兜底，不抛）。
   * @param user 当前登录用户（上传目录隔离）
   * @param dto 已上传的实物图 URL
   * @returns 白底图 URL，抠不出为 null
   */
  @Post('cutout')
  async cutout(@CurrentUser() user: User, @Body() dto: CutoutGarmentDto) {
    const cutoutImageUrl = await this.garments.cutoutGarment(user.id, dto.imageUrl);
    return { cutoutImageUrl };
  }

  /**
   * 创建衣物（确认录入 或 先存图后补）。
   * @param user 当前登录用户
   * @param dto 衣物属性
   * @returns 新建的衣物
   */
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateGarmentDto) {
    return this.garments.create(user.id, dto);
  }

  /**
   * 列出当前用户衣橱。
   * @param user 当前登录用户
   * @returns 衣物列表
   */
  @Get()
  list(@CurrentUser() user: User) {
    return this.garments.list(user.id);
  }

  /**
   * 查衣物详情。
   * @param user 当前登录用户
   * @param id 衣物 id
   * @returns 衣物记录
   */
  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.garments.detail(user.id, id);
  }

  /**
   * 记一次穿着：穿着次数 +1，上次穿着日期置为今天（PRD 4.7 数据飞轮起点）。
   * @param user 当前登录用户
   * @param id 衣物 id
   * @returns 更新后的衣物
   */
  @Post(':id/wear')
  wear(@CurrentUser() user: User, @Param('id') id: string) {
    return this.garments.recordWear(user.id, id);
  }

  /**
   * 标记 / 取消闲置（进出断舍离清单，PRD 4.8）。
   * @param user 当前登录用户
   * @param id 衣物 id
   * @param dto 目标闲置状态
   * @returns 更新后的衣物
   */
  @Post(':id/archive')
  setArchived(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SetArchivedDto,
  ) {
    return this.garments.setArchived(user.id, id, dto.archived);
  }
}
